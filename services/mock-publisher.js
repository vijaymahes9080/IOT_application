const mqtt = require('mqtt');
const client = mqtt.connect('mqtt://broker.hivemq.com');

let esp32Data = {
    soilMoisture: 42.0,
    soilTemp: 24.5,
    ldrSensor: 850
};

let satelliteData = {
    gpsLat: 45.201,
    gpsLon: -12.441,
    distanceKm: 12.4,
    velocityKmS: 7.6,
    sys: {
        temp1: 24.5,
        temp2: 22.1,
        battv: 14.1,
        current: 2.54,
        solarp: 85.0,
        gyrox: 0.02,
        gyroy: 0.00,
        gyroz: -0.01
    }
};

client.on('connect', () => {
    try { console.log("[Mock Publisher] Connected. Publishing telemetry to satellite/titan-1/telemetry..."); } catch (e) { }
    setInterval(() => {
        // Agri Data Variance
        esp32Data.soilMoisture += (Math.random() - 0.5) * 2;
        esp32Data.soilTemp += (Math.random() - 0.5) * 0.5;
        esp32Data.ldrSensor += (Math.random() - 0.5) * 50;
        esp32Data.soilMoisture = Math.max(10, Math.min(esp32Data.soilMoisture, 80));

        // GPS Variance
        satelliteData.gpsLat += (Math.random() - 0.5) * 0.001;
        satelliteData.gpsLon += (Math.random() - 0.5) * 0.001;

        // Orbital Variance
        const liveDist = satelliteData.distanceKm + (Math.sin(Date.now() * 0.001) * 0.2);
        const liveVel = satelliteData.velocityKmS + (Math.cos(Date.now() * 0.0005) * 0.05);

        // System Telemetry Variance
        satelliteData.sys.temp1 += (Math.random() - 0.5) * 1.2;
        satelliteData.sys.temp2 += (Math.random() - 0.5) * 1.2;
        satelliteData.sys.battv += (Math.random() - 0.5) * 0.2;
        if (satelliteData.sys.battv < 11.0) satelliteData.sys.battv = 11.5;
        if (satelliteData.sys.battv > 15.0) satelliteData.sys.battv = 14.5;

        satelliteData.sys.current += (Math.random() - 0.5) * 0.5;
        satelliteData.sys.solarp += (Math.random() - 0.5) * 5.0;

        satelliteData.sys.gyrox += (Math.random() - 0.5) * 0.05;
        satelliteData.sys.gyroy += (Math.random() - 0.5) * 0.05;
        satelliteData.sys.gyroz += (Math.random() - 0.5) * 0.05;

        // Cap limits somewhat
        if (Math.abs(satelliteData.sys.gyrox) > 0.5) satelliteData.sys.gyrox = 0;
        if (Math.abs(satelliteData.sys.gyroy) > 0.5) satelliteData.sys.gyroy = 0;
        if (Math.abs(satelliteData.sys.gyroz) > 0.5) satelliteData.sys.gyroz = 0;

        const payload = {
            esp32: { ...esp32Data },
            satellite: {
                latitude: satelliteData.gpsLat,
                longitude: satelliteData.gpsLon,
                distance: liveDist,
                velocity: liveVel,
                sys: { ...satelliteData.sys }
            },
            timestamp: Date.now()
        };

        client.publish('satellite/titan-1/telemetry', JSON.stringify(payload));
    }, 10000); // 10s intervals for CPU conservation
});
