import threading
import time
import logging
from .pipeline import LearningPipeline

logging.basicConfig(level=logging.ERROR)

class AutonomousManager:
    _instance = None
    
    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(AutonomousManager, cls).__new__(cls)
        return cls._instance

    def __init__(self, db_path, model_dir, tb_config=None):
        if not hasattr(self, 'initialized'):
            self.pipeline = LearningPipeline(db_path, model_dir, tb_config=tb_config)
            self.stop_event = threading.Event()
            self.thread = None
            self.initialized = True

    def start_pipeline(self, interval_seconds=10): # Accelerated loop (10s)
        """Start the autonomous training thread (Silent)."""
        if self.thread and self.thread.is_alive():
            return
            
        def _loop():
            # Delay startup to let system stabilize
            if self.stop_event.wait(10):
                return
            while not self.stop_event.is_set():
                try:
                    # Autonomous Detection, Preprocessing, Training, Monitoring
                    self.pipeline.run_autonomous_cycle()
                    # Rule 4: Edge Pruning task to keep MS Access stable
                    self.pipeline.data_handler.prune_synced_data()
                except Exception as e:
                    logging.error(f"[AutonomousManager] Cycle Error: {e}")
                
                # Performance: Explicitly collect garbage after heavy training cycle
                import gc
                gc.collect()
                
                self.stop_event.wait(interval_seconds)

        self.thread = threading.Thread(target=_loop, daemon=True)
        self.thread.start()

    def stop_pipeline(self):
        self.stop_event.set()
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=10)

    def reset_system(self):
        """Trigger 'RESET MODELS' rule."""
        self.pipeline.reset_models()
        self.pipeline.run_autonomous_cycle() # Start fresh training from base dataset
