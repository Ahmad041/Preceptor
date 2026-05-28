import subprocess
import time
import requests
import atexit
import psutil
import logging
import threading

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("GitNexusRunner")

class GitNexusRunner:
    def __init__(self, port=4747, working_dir="."):
        self.port = port
        self.working_dir = working_dir
        self.process = None
        self._monitor_thread = None
        self._stop_event = threading.Event()

    def start(self):
        if self.is_running():
            logger.info(f"GitNexus is already running on port {self.port}")
            return True

        logger.info(f"Starting GitNexus on port {self.port}...")
        
        # We run it using npx to ensure it's executed even if not globally installed
        cmd = f"npx -y gitnexus serve"
        
        try:
            self.process = subprocess.Popen(
                cmd,
                shell=True,
                cwd=self.working_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            
            # Start background thread to consume output so it doesn't block
            self._monitor_thread = threading.Thread(target=self._monitor_output, daemon=True)
            self._monitor_thread.start()

            # Wait for it to become healthy
            logger.info("Waiting for GitNexus to become healthy...")
            for i in range(60):
                if self.is_running():
                    logger.info("GitNexus started successfully.")
                    return True
                time.sleep(1)
                
            logger.error("GitNexus failed to start within the timeout.")
            return False
            
        except Exception as e:
            logger.error(f"Failed to start GitNexus: {e}")
            return False

    def _monitor_output(self):
        if not self.process:
            return
        
        while not self._stop_event.is_set():
            line = self.process.stdout.readline()
            if not line and self.process.poll() is not None:
                break
            if line:
                logger.debug(f"[GitNexus] {line.strip()}")

    def stop(self):
        self._stop_event.set()
        if self.process:
            logger.info("Stopping GitNexus...")
            try:
                parent = psutil.Process(self.process.pid)
                for child in parent.children(recursive=True):
                    child.terminate()
                parent.terminate()
                self.process.wait(timeout=5)
            except psutil.NoSuchProcess:
                pass
            except Exception as e:
                logger.error(f"Error stopping GitNexus: {e}")
            self.process = None
            logger.info("GitNexus stopped.")

    def is_running(self):
        try:
            # We assume gitnexus serve will respond to a basic request
            # We'll just try to hit the root or an API endpoint
            # Since we don't know the exact health endpoint, any HTTP response (even 404) means the server is up.
            response = requests.get(f"http://localhost:{self.port}", timeout=1)
            return True
        except requests.ConnectionError:
            return False
        except Exception:
            return False

# Global instance
gitnexus_server = GitNexusRunner()

# Register fallback cleanup
atexit.register(gitnexus_server.stop)
