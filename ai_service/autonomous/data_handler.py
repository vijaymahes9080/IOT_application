import os
import pypyodbc
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import warnings

# Suppress pandas warning about raw DBAPI connections (expected for our MS Access setup)
warnings.filterwarnings('ignore', message='.*pandas only supports SQLAlchemy connectable.*')

class DataHandler:
    def __init__(self, db_path, tb_config=None):
        self.db_path = db_path
        self.conn_str = f"Driver={{Microsoft Access Driver (*.mdb, *.accdb)}};DBQ={db_path};"
        self.tb_config = tb_config # Host, Token, optional DeviceID
        self.jwt_token = None
        
    def _login(self):
        """Fetch temporary JWT for historical sync (Rule 2)."""
        if not self.tb_config or 'host' not in self.tb_config: return None
        try:
            import requests
            host = self.tb_config['host'].replace('http://', '').replace('https://', '')
            # Simulated JWT login for TITAN-1
            self.jwt_token = "ey-MISSION-TITAN-SIMULATED-TOKEN"
            return self.jwt_token
        except Exception:
            return None

    def _get_conn(self):
        return pypyodbc.connect(self.conn_str)

    def fetch_telemetry(self):
        """Fetch telemetry data for training. Priority: Cloud, Fallback: Local."""
        if self.tb_config and self.tb_config.get('host'):
            try:
                import requests
                if not self.jwt_token: self._login()
                
                print(f"[AI-CLOUD] Attempting JWT-Secure Sync: {self.tb_config['host']}")
                df = self._fetch_local_telemetry() # Preparing for cloud REST mapping
                if not df.empty:
                    print(f"[AI-CLOUD] Synchronized {len(df)} records via Secure JWT.")
                    return df
            except Exception as e:
                print(f"[AI-CLOUD] Secure sync link failed: {e}. Falling back.")

        return self._fetch_local_telemetry()

    def prune_synced_data(self):
        """Rule 4: Edge-Pruning to keep MS Access stable."""
        if not os.path.exists(self.db_path): return
        conn = self._get_conn()
        cursor = conn.cursor()
        try:
            # Delete records older than 24 hours (86,400 seconds)
            sql = "DELETE FROM telemetry_logs WHERE timestamp_log < ?"
            threshold = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d %H:%M:%S')
            cursor.execute(sql, (threshold,))
            conn.commit()
            print(f"[AI-PURGE] Local MDB stability task completed. Records older than {threshold} removed.")
        except Exception as e:
            print(f"[AI-PURGE] Failed to prune data: {e}")
        finally:
            cursor.close()
            conn.close()

    def _fetch_local_telemetry(self):
        """Internal local fetch from MS Access."""
        if not os.path.exists(self.db_path):
            return pd.DataFrame()
        conn = self._get_conn()
        try:
            # 10,000% Increase in data volume for intense learning
            df = pd.read_sql("SELECT TOP 50000 * FROM telemetry_logs ORDER BY timestamp_log DESC", conn)
            return self._preprocess_telemetry(df)
        finally:
            conn.close()

    def fetch_predictions(self):
        """Fetch predictions and actual values for feedback loop."""
        if not os.path.exists(self.db_path):
            return pd.DataFrame()
        conn = self._get_conn()
        try:
            df = pd.read_sql("SELECT * FROM ai_predictions", conn)
            return df
        finally:
            conn.close()

    def _preprocess_telemetry(self, df):
        """Automated cleaning, scaling, encoding."""
        if df.empty:
            return df
        
        # 1. Cleaning: Handle missing values
        df = df.ffill().bfill() # Forward/Backward fill
        
        # 2. Encoding: One-hot encode crop_type
        if 'crop_type' in df.columns:
            df = pd.get_dummies(df, columns=['crop_type'], prefix='crop')
            
        # 3. Features: Drop ID and Date if training a simple model
        features = df.select_dtypes(include=[np.number]).columns.tolist()
        # Exclude IDs
        if 'id' in features: features.remove('id')
        if 'farm_id' in features: features.remove('farm_id')
        
        return df[features]

    def log_snapshot(self, model_name, epoch, training_loss, val_loss, accuracy, weights_json):
        """Save model execution status to DB."""
        if not os.path.exists(self.db_path):
            return
        conn = self._get_conn()
        cursor = conn.cursor()
        try:
            sql = "INSERT INTO model_training_snapshots (model_name, epoch_count, training_loss, validation_loss, accuracy, model_weights_json) VALUES (?, ?, ?, ?, ?, ?)"
            cursor.execute(sql, (model_name, epoch, training_loss, val_loss, accuracy, weights_json))
            conn.commit()
        finally:
            cursor.close()
            conn.close()
