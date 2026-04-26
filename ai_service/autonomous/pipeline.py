import os
import joblib
import torch
import torch.nn as nn
import torch.optim as optim
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, RandomizedSearchCV
from sklearn.metrics import mean_squared_error, r2_score, accuracy_score, f1_score
from scipy import stats
from .data_handler import DataHandler
from .models import ModelFactory

class LearningPipeline:
    def __init__(self, db_path, model_dir, tb_config=None):
        self.db_path = db_path
        self.model_dir = model_dir
        os.makedirs(model_dir, exist_ok=True)
        self.data_handler = DataHandler(db_path, tb_config=tb_config)
        self.best_model_name = None
        self.versions = {} # Persist in file later
        self.last_training_time = None
        self.drift_detected = False

    def check_drift(self, df_new, df_old):
        """Monitor feature distribution drift."""
        if df_old.empty or df_new.empty: return False
        
        # Simple Kolmogorov-Smirnov test for drift
        for col in df_new.select_dtypes(include=[np.number]).columns:
            if col in df_old.columns:
                _, p_value = stats.ks_2samp(df_new[col], df_old[col])
                if p_value < 0.05: # Drift detected
                    return True
        return False

    def train_and_eval(self, model_type, X_train, X_test, y_train, y_test):
        """Train a given model and return metrics."""
        try:
            model = ModelFactory.create_model(model_type, input_dim=X_train.shape[1])
            
            # Scikit-learn models
            if hasattr(model, 'fit') and not isinstance(model, nn.Module):
                model.fit(X_train, y_train)
                preds = model.predict(X_test)
                r2 = r2_score(y_test, preds)
                mse = mean_squared_error(y_test, preds)
                return model, {"r2": r2, "mse": mse, "score": r2}
            
            # PyTorch models (LSTM, CNN, Transformer)
            elif isinstance(model, nn.Module):
                # Convert to tensors
                X_t = torch.tensor(X_train.values, dtype=torch.float32).unsqueeze(1)
                y_t = torch.tensor(y_train.values, dtype=torch.float32).unsqueeze(1)
                X_v = torch.tensor(X_test.values, dtype=torch.float32).unsqueeze(1)
                y_v = torch.tensor(y_test.values, dtype=torch.float32).unsqueeze(1)
                
                criterion = nn.MSELoss()
                optimizer = optim.Adam(model.parameters(), lr=0.1)
                scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, 'min', patience=5, factor=0.5)
                
                # Optimized for CPU (30 epochs instead of 200)
                for epoch in range(30):
                    model.train()
                    optimizer.zero_grad()
                    out = model(X_t)
                    loss = criterion(out, y_t)
                    loss.backward()
                    optimizer.step()
                    
                    if epoch > 0 and epoch % 5 == 0:
                        model.eval()
                        with torch.no_grad():
                            val_out = model(X_v)
                            val_loss = criterion(val_out, y_v).item()
                            scheduler.step(val_loss)
                            if val_loss > 1.2 * loss.item():
                                break
                                
                model.eval()
                with torch.no_grad():
                    preds = model(X_v).numpy()
                    preds_flat = preds.flatten()
                    y_test_flat = y_v.numpy().flatten()
                    r2 = r2_score(y_test_flat, preds_flat)
                    return model, {"r2": r2, "mse": mean_squared_error(y_test_flat, preds_flat), "score": r2}
            return None, {}
        except Exception as e:
            print(f"Failed to train and eval {model_type}: {e}")
            return None, {}

    def run_autonomous_cycle(self):
        """Self-improving training logic optimized for CPU stability."""
        df = self.data_handler.fetch_telemetry()
        if df.empty or len(df) < 10: return
        
        # Skip training if no drift detected to save massive CPU
        if not self.drift_detected and np.random.random() > 0.15:
            return 

        target_col = 'soil_moisture' if 'soil_moisture' in df.columns else df.select_dtypes(include=[np.number]).columns[-1]
        y = df[target_col]
        X = df.drop(columns=[target_col])
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        
        # Selective Model Training (Rotate based on CPU budget)
        if np.random.random() > 0.5:
            model_types = ['LSTM', 'RandomForest', 'XGBoost']
        else:
            model_types = ['CNN', 'GradientBoosting', 'Transformer']
            
        performances = {}
        candidate_models = {}
        
        for mt in model_types:
            model, metric = self.train_and_eval(mt, X_train, X_test, y_train, y_test)
            if model:
                performances[mt] = metric['score']
                candidate_models[mt] = model
                
        if not performances: return
        best_mt = max(performances, key=performances.get)
        new_score = performances[best_mt]
        
        old_score = self.versions.get('current_best_score', 0)
        if new_score > old_score or new_score > 0.6:
            self.best_model_name = best_mt
            self.versions['current_best_score'] = new_score
            save_path = os.path.join(self.model_dir, 'active_model.pkl')
            if isinstance(candidate_models[best_mt], nn.Module):
                torch.save(candidate_models[best_mt], save_path)
            else:
                joblib.dump(candidate_models[best_mt], save_path)
                
            with open(os.path.join(self.model_dir, 'feature_names.json'), 'w') as f:
                import json
                json.dump(X.columns.tolist(), f)
            self.data_handler.log_snapshot(best_mt, 30, 0, 0, new_score, f"New Best: {best_mt}")
            
    def reset_models(self):
        """Delete all trained weights and reinitialize."""
        if os.path.exists(self.model_dir):
            for file in os.listdir(self.model_dir):
                os.remove(os.path.join(self.model_dir, file))
        self.versions = {}
        self.best_model_name = None
