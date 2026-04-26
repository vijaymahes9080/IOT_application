# Autonomous AI/ML/DL Pipeline (ORBIT-X)

## Architecture
- **Data Layer**: Direct OLEDB connection to `mission_logs.mdb`.
- **Learning Loop**: Background thread runs every 300s (configurable).
- **Models**: Unified factory supporting Deep Learning (PyTorch) and traditional ML (Scikit-Learn/XGBoost).
- **Drift Monitor**: Statistical distribution check (KS-Test) triggers retraining.
- **Overfitting Guard**: Automatic hyperparameter adjustment based on Val-Loss gap.
- **Selection**: Best model based on R2/Accuracy is atomically deployed.

## Rules Followed
- **Silent**: No console logs during training.
- **Concise**: Result-only JSON output.
- **Autonomous**: Auto-detection of new records for incremental updates.
- **Reset**: `/reset` endpoint reinitializes the entire brain.

🚀 System is now fully self-improving.
