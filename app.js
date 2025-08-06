// Breathing Signal Monitor - Medical Device Interface
class BreathingMonitor {
    constructor() {
        this.isAuthenticated = false;
        this.websocket = null;
        this.charts = {};
        this.dataBuffer = {
            sensor1: [],
            sensor2: [],
            sensor3: []
        };
        this.recordedData = [];
        this.isRecording = false;
        this.isConnected = false;
        this.sampleRate = 0;
        this.dataCount = 0;
        this.sessionStartTime = null;
        this.lastDataTime = 0;
        this.sampleTimes = [];
        
        // Configuration
        this.maxDataPoints = 30000; // 30 seconds at 1kHz
        this.timeWindow = 30; // seconds
        this.targetSampleRate = 1000; // Hz
        
        // Chart colors
        this.chartColors = {
            sensor1: '#00ff88',
            sensor2: '#00a8ff', 
            sensor3: '#ff9500'
        };
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateSessionTimer();
        
        // Check for saved session
        const savedUser = localStorage.getItem('breathingMonitor_user');
        if (savedUser) {
            this.showMainApp();
        }
    }

    setupEventListeners() {
        // Login form
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Main app controls
        document.getElementById('connect-btn').addEventListener('click', () => {
            this.toggleConnection();
        });

        document.getElementById('logout-btn').addEventListener('click', () => {
            this.handleLogout();
        });

        document.getElementById('export-btn').addEventListener('click', () => {
            this.exportData();
        });

        document.getElementById('start-recording').addEventListener('click', () => {
            this.startRecording();
        });

        document.getElementById('stop-recording').addEventListener('click', () => {
            this.stopRecording();
        });

        document.getElementById('clear-data').addEventListener('click', () => {
            this.clearData();
        });

        // Settings
        document.getElementById('time-window').addEventListener('change', (e) => {
            this.timeWindow = parseInt(e.target.value);
            this.updateChartTimeWindow();
        });

        document.getElementById('auto-scale').addEventListener('change', (e) => {
            this.updateChartScaling(e.target.checked);
        });
    }

    handleLogin() {
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        // Simple authentication (in real app, this would be server-side)
        if (username && password) {
            // Demo credentials: any non-empty username/password
            localStorage.setItem('breathingMonitor_user', username);
            this.isAuthenticated = true;
            this.sessionStartTime = Date.now();
            this.showMainApp();
        } else {
            alert('Please enter username and password');
        }
    }

    handleLogout() {
        if (this.websocket) {
            this.websocket.close();
        }
        localStorage.removeItem('breathingMonitor_user');
        this.isAuthenticated = false;
        this.showLoginForm();
        this.resetSession();
    }

    showMainApp() {
        document.getElementById('login-container').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        this.isAuthenticated = true;
        this.sessionStartTime = Date.now();
        this.initializeCharts();
    }

    showLoginForm() {
        document.getElementById('login-container').classList.remove('hidden');
        document.getElementById('main-app').classList.add('hidden');
    }

    resetSession() {
        this.dataBuffer = { sensor1: [], sensor2: [], sensor3: [] };
        this.recordedData = [];
        this.isRecording = false;
        this.isConnected = false;
        this.sampleRate = 0;
        this.dataCount = 0;
        this.sessionStartTime = null;
        this.updateUI();
    }

    initializeCharts() {
        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    min: 0,
                    max: this.timeWindow,
                    title: {
                        display: true,
                        text: 'Time (seconds)',
                        color: '#b8bcc8'
                    },
                    grid: {
                        color: '#3a3d42'
                    },
                    ticks: {
                        color: '#b8bcc8',
                        maxTicksLimit: 10
                    }
                },
                y: {
                    min: -500,
                    max: 500,
                    title: {
                        display: true,
                        text: 'Voltage (mV)',
                        color: '#b8bcc8'
                    },
                    grid: {
                        color: '#3a3d42'
                    },
                    ticks: {
                        color: '#b8bcc8'
                    }
                }
            }
        };

        // Initialize charts for each sensor
        ['sensor1', 'sensor2', 'sensor3'].forEach((sensor, index) => {
            const ctx = document.getElementById(`${sensor}-chart`).getContext('2d');
            
            this.charts[sensor] = new Chart(ctx, {
                type: 'line',
                data: {
                    datasets: [{
                        label: `${sensor.toUpperCase()}`,
                        data: [],
                        borderColor: this.chartColors[sensor],
                        backgroundColor: this.chartColors[sensor] + '20',
                        borderWidth: 1,
                        pointRadius: 0,
                        pointHoverRadius: 0,
                        tension: 0.1
                    }]
                },
                options: chartOptions
            });
        });
    }

    toggleConnection() {
        if (this.isConnected) {
            this.disconnect();
        } else {
            this.connect();
        }
    }

    connect() {
        const ip = document.getElementById('esp32-ip').value || 'localhost';
        const port = document.getElementById('esp32-port').value || '8080';
        const wsUrl = `ws://${ip}:${port}`;

        try {
            this.websocket = new WebSocket(wsUrl);
            
            this.websocket.onopen = () => {
                this.isConnected = true;
                this.updateConnectionStatus('Connected', true);
                document.getElementById('connect-btn').textContent = 'Disconnect';
                console.log('WebSocket connected');
                
                // Start the ESP32 simulator if connecting to localhost
                if (ip === 'localhost') {
                    this.startSimulator();
                }
            };

            this.websocket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.processIncomingData(data);
                } catch (error) {
                    console.error('Error parsing WebSocket data:', error);
                }
            };

            this.websocket.onclose = () => {
                this.isConnected = false;
                this.updateConnectionStatus('Disconnected', false);
                document.getElementById('connect-btn').textContent = 'Connect';
                console.log('WebSocket disconnected');
            };

            this.websocket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateConnectionStatus('Error', false);
            };

        } catch (error) {
            console.error('Connection error:', error);
            alert('Failed to connect. Please check the IP address and port.');
        }
    }

    disconnect() {
        if (this.websocket) {
            this.websocket.close();
        }
        this.stopSimulator();
    }

    // ESP32 Data Simulator for testing
    startSimulator() {
        this.simulatorInterval = setInterval(() => {
            if (this.isConnected) {
                const timestamp = Date.now();
                const time = (timestamp - this.sessionStartTime) / 1000;
                
                // Generate realistic breathing signals
                const breathingRate = 0.3; // Hz (18 breaths per minute)
                const heartRate = 1.2; // Hz (72 BPM)
                
                const data = {
                    timestamp: timestamp,
                    sensor1: 150 * Math.sin(2 * Math.PI * breathingRate * time) + 
                            20 * Math.sin(2 * Math.PI * heartRate * time) +
                            (Math.random() - 0.5) * 10, // Chest movement
                    sensor2: 120 * Math.sin(2 * Math.PI * breathingRate * time + Math.PI/4) + 
                            15 * Math.sin(2 * Math.PI * heartRate * time) +
                            (Math.random() - 0.5) * 8, // Abdominal movement
                    sensor3: 80 * Math.sin(2 * Math.PI * breathingRate * time + Math.PI/2) +
                            (Math.random() - 0.5) * 5 // Reference signal
                };

                // Simulate WebSocket message
                this.processIncomingData(data);
            }
        }, 1); // 1ms interval for 1kHz simulation
    }

    stopSimulator() {
        if (this.simulatorInterval) {
            clearInterval(this.simulatorInterval);
            this.simulatorInterval = null;
        }
    }

    processIncomingData(data) {
        const currentTime = Date.now();
        
        // Calculate sample rate
        this.sampleTimes.push(currentTime);
        if (this.sampleTimes.length > 100) {
            this.sampleTimes.shift();
        }
        
        if (this.sampleTimes.length > 1) {
            const timeDiff = (this.sampleTimes[this.sampleTimes.length - 1] - this.sampleTimes[0]) / 1000;
            this.sampleRate = Math.round((this.sampleTimes.length - 1) / timeDiff);
        }

        // Convert timestamp to relative time in seconds
        const relativeTime = this.sessionStartTime ? 
            (data.timestamp - this.sessionStartTime) / 1000 : 0;

        // Add data to buffers
        ['sensor1', 'sensor2', 'sensor3'].forEach(sensor => {
            this.dataBuffer[sensor].push({
                x: relativeTime,
                y: data[sensor]
            });

            // Limit buffer size
            if (this.dataBuffer[sensor].length > this.maxDataPoints) {
                this.dataBuffer[sensor].shift();
            }
        });

        // Record data if recording is active
        if (this.isRecording) {
            this.recordedData.push({
                timestamp: data.timestamp,
                relativeTime: relativeTime,
                sensor1: data.sensor1,
                sensor2: data.sensor2,
                sensor3: data.sensor3
            });
        }

        this.dataCount++;
        this.updateCharts();
        this.updateUI();
        this.updateSensorStats(data);
    }

    updateCharts() {
        const currentTime = this.sessionStartTime ? 
            (Date.now() - this.sessionStartTime) / 1000 : 0;

        ['sensor1', 'sensor2', 'sensor3'].forEach(sensor => {
            const chart = this.charts[sensor];
            if (!chart) return;

            // Filter data for current time window
            const windowStart = Math.max(0, currentTime - this.timeWindow);
            const filteredData = this.dataBuffer[sensor].filter(
                point => point.x >= windowStart
            );

            chart.data.datasets[0].data = filteredData;
            
            // Update x-axis range
            chart.options.scales.x.min = windowStart;
            chart.options.scales.x.max = currentTime;
            
            chart.update('none');
        });
    }

    updateChartTimeWindow() {
        this.maxDataPoints = this.timeWindow * this.targetSampleRate;
        
        // Update all charts
        ['sensor1', 'sensor2', 'sensor3'].forEach(sensor => {
            const chart = this.charts[sensor];
            if (chart) {
                chart.options.scales.x.max = this.timeWindow;
                chart.update();
            }
        });
    }

    updateChartScaling(autoScale) {
        ['sensor1', 'sensor2', 'sensor3'].forEach(sensor => {
            const chart = this.charts[sensor];
            if (chart) {
                if (autoScale) {
                    delete chart.options.scales.y.min;
                    delete chart.options.scales.y.max;
                } else {
                    chart.options.scales.y.min = -500;
                    chart.options.scales.y.max = 500;
                }
                chart.update();
            }
        });
    }

    updateConnectionStatus(status, connected) {
        const statusElement = document.getElementById('connection-status');
        statusElement.textContent = status;
        statusElement.className = `status-value ${connected ? 'connected' : 'disconnected'}`;
    }

    updateUI() {
        document.getElementById('sample-rate').textContent = `${this.sampleRate} Hz`;
        document.getElementById('data-count').textContent = this.dataCount.toLocaleString();
        document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
    }

    updateSensorStats(data) {
        ['sensor1', 'sensor2', 'sensor3'].forEach(sensor => {
            const currentValue = data[sensor];
            const buffer = this.dataBuffer[sensor];
            
            // Calculate average
            const average = buffer.length > 0 ? 
                buffer.reduce((sum, point) => sum + point.y, 0) / buffer.length : 0;

            document.getElementById(`${sensor}-current`).textContent = currentValue.toFixed(2);
            document.getElementById(`${sensor}-avg`).textContent = average.toFixed(2);
        });
    }

    updateSessionTimer() {
        setInterval(() => {
            if (this.sessionStartTime) {
                const elapsed = Date.now() - this.sessionStartTime;
                const hours = Math.floor(elapsed / 3600000);
                const minutes = Math.floor((elapsed % 3600000) / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                
                document.getElementById('session-duration').textContent = 
                    `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }

    startRecording() {
        this.isRecording = true;
        this.recordedData = [];
        document.getElementById('start-recording').classList.add('hidden');
        document.getElementById('stop-recording').classList.remove('hidden');
        console.log('Recording started');
    }

    stopRecording() {
        this.isRecording = false;
        document.getElementById('start-recording').classList.remove('hidden');
        document.getElementById('stop-recording').classList.add('hidden');
        console.log(`Recording stopped. ${this.recordedData.length} data points recorded.`);
    }

    clearData() {
        if (confirm('Are you sure you want to clear all data? This action cannot be undone.')) {
            this.dataBuffer = { sensor1: [], sensor2: [], sensor3: [] };
            this.recordedData = [];
            this.dataCount = 0;
            
            // Clear charts
            ['sensor1', 'sensor2', 'sensor3'].forEach(sensor => {
                if (this.charts[sensor]) {
                    this.charts[sensor].data.datasets[0].data = [];
                    this.charts[sensor].update();
                }
            });
            
            this.updateUI();
            console.log('Data cleared');
        }
    }

    exportData() {
        if (this.recordedData.length === 0) {
            alert('No recorded data to export. Please start recording first.');
            return;
        }

        // Create CSV content
        const headers = ['Timestamp', 'Relative Time (s)', 'Sensor 1 (mV)', 'Sensor 2 (mV)', 'Sensor 3 (mV)'];
        let csvContent = headers.join(',') + '\n';

        this.recordedData.forEach(row => {
            csvContent += [
                new Date(row.timestamp).toISOString(),
                row.relativeTime.toFixed(3),
                row.sensor1.toFixed(3),
                row.sensor2.toFixed(3),
                row.sensor3.toFixed(3)
            ].join(',') + '\n';
        });

        // Create and download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `breathing_data_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log(`Exported ${this.recordedData.length} data points to CSV`);
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.breathingMonitor = new BreathingMonitor();
    console.log('Breathing Signal Monitor initialized');
});