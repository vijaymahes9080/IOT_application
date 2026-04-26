import torch
import torch.nn as nn
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.svm import SVR
from sklearn.linear_model import LogisticRegression, LinearRegression
from xgboost import XGBRegressor, XGBClassifier

class LSTMModel(nn.Module):
    def __init__(self, input_size, hidden_size=64, num_layers=2):
        super(LSTMModel, self).__init__()
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True)
        self.fc = nn.Linear(hidden_size, 1)

    def forward(self, x):
        out, _ = self.lstm(x)
        return self.fc(out[:, -1, :])

class CNNModel(nn.Module):
    def __init__(self, input_dim=10, input_channels=1):
        super(CNNModel, self).__init__()
        self.conv1 = nn.Conv1d(input_channels, 16, kernel_size=3, padding=1)
        self.pool = nn.AdaptiveMaxPool1d(4)
        self.fc = nn.Linear(16 * 4, 1)

    def forward(self, x):
        x = torch.relu(self.conv1(x))
        x = self.pool(x)
        x = torch.flatten(x, 1)
        return self.fc(x)

class TransformerModel(nn.Module):
    def __init__(self, input_size, nhead=8, num_layers=3):
        super(TransformerModel, self).__init__()
        self.d_model = 64  # Needs to be a multiple of nhead (8)
        self.embedding = nn.Linear(input_size, self.d_model)
        self.encoder_layer = nn.TransformerEncoderLayer(d_model=self.d_model, nhead=nhead, batch_first=True)
        self.transformer = nn.TransformerEncoder(self.encoder_layer, num_layers=num_layers)
        self.fc = nn.Linear(self.d_model, 1)

    def forward(self, x):
        x = self.embedding(x)
        x = self.transformer(x)
        return self.fc(x[:, -1, :])

class ModelFactory:
    @staticmethod
    def create_model(name, input_dim=10):
        if name == 'LSTM': return LSTMModel(input_dim)
        if name == 'CNN': return CNNModel(input_dim)
        if name == 'Transformer': return TransformerModel(input_dim)
        if name == 'RandomForest': return RandomForestRegressor(n_estimators=100)
        if name == 'XGBoost': return XGBRegressor(n_estimators=100)
        if name == 'SVM': return SVR()
        if name == 'LogisticRegression': return LogisticRegression()
        if name == 'GradientBoosting': return GradientBoostingRegressor()
        return LinearRegression()
