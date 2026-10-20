"""Disposable loopback S3 + a real ffmpeg AAC/HLS encoder for Playwright.

Run with the task's isolated venv; see docs/testing/local-playwright.md.
Moto exercises S3 PUT/HEAD/GET/CORS, not Cloudflare's deployment or SigV4 enforcement.
"""
from contextlib import ExitStack
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote, urlsplit

# Deliberately do not consult AWS_* variables, ~/.aws, or default boto sessions.
KEY = "synthetic-local-only"
BUCKET = "wildcat-browser-e2e"


def exclusive_socket(sock):
    if os.name == "nt":
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)


class ExclusiveHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = False

    def server_bind(self):
        exclusive_socket(self.socket)
        super().server_bind()


def loopback(name):
    value = os.environ.get(name, "")
    parsed = urlsplit(value)
    if (parsed.scheme != "http" or parsed.hostname != "127.0.0.1" or not parsed.port
            or parsed.username or parsed.password or parsed.path not in ("", "/")
            or parsed.query or parsed.fragment):
        raise RuntimeError(f"{name} must be an explicit http://127.0.0.1:PORT origin")
    return value.rstrip("/"), parsed.port


def main():
    endpoint, s3_port = loopback("R2_ENDPOINT")
    delivery, delivery_port = loopback("PLAYWRIGHT_LOCAL_SERVICES_URL")
    if s3_port == delivery_port:
        raise RuntimeError("S3 and delivery require different ports")
    # Windows SO_REUSEADDR can otherwise let independent HTTP servers share a
    # listening port. Refuse occupied targets before acquiring any resources.
    for port in (s3_port, delivery_port):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            exclusive_socket(probe)
            probe.bind(("127.0.0.1", port))
    if os.environ.get("STREAM_PUBLIC_URL") != delivery:
        raise RuntimeError("STREAM_PUBLIC_URL must equal PLAYWRIGHT_LOCAL_SERVICES_URL")
    if os.environ.get("R2_BUCKET") != BUCKET or any(
        os.environ.get(name) != KEY for name in ("R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY")
    ):
        raise RuntimeError("Only the documented synthetic credentials and bucket are accepted")
    web = urlsplit(os.environ.get("PLAYWRIGHT_BASE_URL", ""))
    if web.scheme != "http" or web.hostname not in ("localhost", "127.0.0.1", "::1"):
        raise RuntimeError("PLAYWRIGHT_BASE_URL must be loopback")
    origin = f"{web.scheme}://{web.netloc}"
    root = Path(os.environ["PLAYWRIGHT_LOCAL_SERVICES_DIR"]).resolve()
    # No deletes/resets: every run gets a fresh child directory in an explicit .agent tree.
    if ".agent" not in root.parts:
        raise RuntimeError("PLAYWRIGHT_LOCAL_SERVICES_DIR must be inside a .agent directory")
    root.mkdir(parents=True, exist_ok=True)
    media = Path(tempfile.mkdtemp(prefix="hls-", dir=root))

    from moto.server import ThreadedMotoServer
    import boto3
    from botocore.exceptions import ClientError

    s3_server = ThreadedMotoServer(ip_address="127.0.0.1", port=s3_port, verbose=False)
    s3_server.start()
    with ExitStack() as resources:
        resources.callback(s3_server.stop)
        s3 = boto3.client("s3", endpoint_url=endpoint, region_name="us-east-1",
                          aws_access_key_id=KEY, aws_secret_access_key=KEY)
        s3.create_bucket(Bucket=BUCKET)
        s3.put_bucket_cors(Bucket=BUCKET, CORSConfiguration={"CORSRules": [{
            "AllowedOrigins": [origin], "AllowedMethods": ["GET", "HEAD", "PUT"],
            "AllowedHeaders": ["*"], "ExposeHeaders": ["ETag"], "MaxAgeSeconds": 0,
        }]})
        encoder_log = (media / "ffmpeg.log").open("wb")
        resources.callback(encoder_log.close)
        encoder = subprocess.Popen([
            os.environ.get("FFMPEG_EXECUTABLE", "ffmpeg"), "-hide_banner", "-loglevel", "warning",
            "-re", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
            "-c:a", "aac", "-b:a", "96k", "-f", "hls", "-hls_time", "1",
            "-hls_list_size", "12", "-hls_flags", "delete_segments+omit_endlist+temp_file",
            "-hls_segment_filename", str(media / "segment-%06d.ts"), str(media / "live.m3u8"),
        ], stdout=encoder_log, stderr=encoder_log,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)

        def stop_encoder():
            if encoder.poll() is None:
                encoder.terminate()
            try:
                encoder.wait(timeout=10)
            except subprocess.TimeoutExpired:
                encoder.kill()
                encoder.wait(timeout=10)

        resources.callback(stop_encoder)
        counters = {"playlistGets": 0, "segmentGets": 0, "objectGets": 0}

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def send(self, status, content_type, body):
                self.send_response(status)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)

            def do_GET(self):
                route = unquote(urlsplit(self.path).path)
                if route == "/__health":
                    playlist = media / "live.m3u8"
                    ready = encoder.poll() is None and playlist.exists() and len(list(media.glob("*.ts"))) >= 4
                    self.send(200 if ready else 503, "application/json", json.dumps({
                        "service": "wildcat-local-browser-services-v1", "ready": ready,
                        "s3Endpoint": endpoint, "bucket": BUCKET, "encoderPid": encoder.pid,
                        "pid": os.getpid(), **counters,
                    }).encode())
                    return
                parts = route.strip("/").split("/")
                # The API derives the real station/generation prefix from its publisher lease.
                if len(parts) == 4 and parts[0] == "stations" and parts[2].isdigit():
                    name = parts[3]
                    if name == "live.m3u8" or (name.startswith("segment-") and name.endswith(".ts")):
                        target = media / name
                        if target.is_file():
                            counters["playlistGets" if name.endswith("m3u8") else "segmentGets"] += 1
                            self.send(200, "application/vnd.apple.mpegurl" if name.endswith("m3u8") else "video/mp2t", target.read_bytes())
                            return
                if route.startswith("/announcements/"):
                    try:
                        obj = s3.get_object(Bucket=BUCKET, Key=route.lstrip("/"))
                        counters["objectGets"] += 1
                        self.send(200, obj["ContentType"], obj["Body"].read())
                        return
                    except ClientError as error:
                        if error.response["ResponseMetadata"]["HTTPStatusCode"] != 404:
                            raise
                self.send(404, "text/plain", b"Not found")

            def do_POST(self):
                if self.path != "/__shutdown" or self.headers.get("X-Local-Fixture-Key") != KEY:
                    self.send(403, "text/plain", b"Local fixture control required")
                    return
                self.send(200, "text/plain", b"Stopping owned local services")
                threading.Thread(target=http.shutdown, daemon=True).start()

        http = ExclusiveHTTPServer(("127.0.0.1", delivery_port), Handler)
        resources.callback(http.server_close)
        def stop(_signum, _frame):
            threading.Thread(target=http.shutdown, daemon=True).start()

        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)
        print(json.dumps({"pid": os.getpid(), "encoderPid": encoder.pid, "delivery": delivery, "s3": endpoint, "media": str(media)}), flush=True)
        http.serve_forever()


if __name__ == "__main__":
    main()
