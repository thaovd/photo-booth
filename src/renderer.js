const { ipcRenderer } = require('electron');

class PhotoBoothApp {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.captureBtn = document.getElementById('captureBtn');
        this.timerButtons = document.querySelectorAll('.timer-btn');
        this.timer = document.getElementById('timer');
        this.previewModal = document.getElementById('previewModal');
        this.previewImage = document.getElementById('previewImage');
        this.settingsModal = document.getElementById('settingsModal');
        this.photoPreview = document.getElementById('photoPreview');
        this.previewControls = document.getElementById('previewControls');
        this.printPreviewBtn = document.getElementById('printPreviewBtn');
        this.retakePreviewBtn = document.getElementById('retakePreviewBtn');
        this.printerSelect = document.getElementById('printerSelect');
        this.refreshPrintersBtn = document.getElementById('refreshPrintersBtn');
        this.cameraSelect = document.getElementById('cameraSelect');
        this.refreshCamerasBtn = document.getElementById('refreshCamerasBtn');
        this.photoProgress = document.getElementById('photoProgress');
        this.currentPhotoNumber = document.getElementById('currentPhotoNumber');
        this.progressFill = document.getElementById('progressFill');
        
        this.currentPhoto = null;
        this.currentPhotoDataUrl = null;
        this.capturedPhotos = []; // Array to store multiple photos
        this.currentPhotoIndex = 0; // Track which photo we're taking
        this.isMultiPhotoSession = false; // Flag for multi-photo mode
        this.isCapturing = false; // Flag to track if currently capturing
        this.captureTimeout = null; // Store timeout for cancelling
        this.templates = [];
        this.printers = [];
        this.cameras = [];
        this.currentStream = null;
        this.selectedTimerValue = 3; // Default timer value
        this.settings = {
            resolution: '1280x720',
            autoPrint: false,
            printCopies: 1,
            selectedPrinter: '',
            selectedCamera: '',
            paperSize: '4x6',
            printQuality: 'normal'
        };
        
        this.init();
    }

    async init() {
        await this.loadCameras();
        await this.initCamera();
        await this.loadTemplates();
        await this.loadPrinters();
        this.bindEvents();
        this.updateStatus();
    }

    async initCamera() {
        try {
            // Stop existing stream if any
            if (this.currentStream) {
                this.currentStream.getTracks().forEach(track => track.stop());
            }

            const constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            };

            // Add device constraint if camera is selected
            if (this.settings.selectedCamera) {
                constraints.video.deviceId = { exact: this.settings.selectedCamera };
            }

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            this.video.srcObject = stream;
            this.currentStream = stream;
            this.updateCameraStatus(true);
            
            this.video.onloadedmetadata = () => {
                this.canvas.width = this.video.videoWidth;
                this.canvas.height = this.video.videoHeight;
            };
        } catch (error) {
            console.error('Error accessing camera:', error);
            this.updateCameraStatus(false);
            alert('Không thể truy cập camera. Vui lòng kiểm tra quyền truy cập.');
        }
    }

    async loadTemplates() {
        try {
            const result = await ipcRenderer.invoke('get-templates');
            if (result.success) {
                this.templates = result.templates;
            }
        } catch (error) {
            console.error('Error loading templates:', error);
        }
    }

    async loadPrinters() {
        try {
            const result = await ipcRenderer.invoke('get-printers');
            if (result.success) {
                this.printers = result.printers;
                this.populatePrinterSelect();
            }
        } catch (error) {
            console.error('Error loading printers:', error);
        }
    }

    async loadCameras() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            this.cameras = devices.filter(device => device.kind === 'videoinput');
            this.populateCameraSelect();
        } catch (error) {
            console.error('Error loading cameras:', error);
        }
    }

    populatePrinterSelect() {
        this.printerSelect.innerHTML = '<option value="">Chọn máy in...</option>';
        
        if (this.printers.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Không tìm thấy máy in';
            option.disabled = true;
            this.printerSelect.appendChild(option);
            return;
        }
        
        this.printers.forEach(printer => {
            const option = document.createElement('option');
            option.value = printer.name;
            option.textContent = `${printer.name}${printer.isDefault ? ' (Mặc định)' : ''} - ${printer.status}`;
            if (printer.isDefault) {
                option.selected = true;
                this.settings.selectedPrinter = printer.name;
            }
            this.printerSelect.appendChild(option);
        });
    }

    populateCameraSelect() {
        this.cameraSelect.innerHTML = '<option value="">Chọn camera...</option>';
        
        if (this.cameras.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Không tìm thấy camera';
            option.disabled = true;
            this.cameraSelect.appendChild(option);
            return;
        }
        
        this.cameras.forEach((camera, index) => {
            const option = document.createElement('option');
            option.value = camera.deviceId;
            option.textContent = camera.label || `Camera ${index + 1}`;
            if (index === 0) {
                option.selected = true;
                this.settings.selectedCamera = camera.deviceId;
            }
            this.cameraSelect.appendChild(option);
        });
    }

    bindEvents() {
        // Capture button
        this.captureBtn.addEventListener('click', () => {
            if (this.isCapturing) {
                this.cancelCapture();
            } else {
                this.startCapture();
            }
        });

        // Modal controls
        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', (e) => {
                e.target.closest('.modal').style.display = 'none';
            });
        });

        // Settings
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.settingsModal.style.display = 'block';
        });

        // Refresh printers button
        this.refreshPrintersBtn.addEventListener('click', async () => {
            this.refreshPrintersBtn.textContent = '🔄 Đang tải...';
            this.refreshPrintersBtn.disabled = true;
            await this.loadPrinters();
            this.refreshPrintersBtn.textContent = '🔄 Làm mới';
            this.refreshPrintersBtn.disabled = false;
        });

        // Refresh cameras button
        this.refreshCamerasBtn.addEventListener('click', async () => {
            this.refreshCamerasBtn.textContent = '🔄 Đang tải...';
            this.refreshCamerasBtn.disabled = true;
            await this.loadCameras();
            this.refreshCamerasBtn.textContent = '🔄 Làm mới';
            this.refreshCamerasBtn.disabled = false;
        });

        // Timer buttons
        this.timerButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Remove active class from all buttons
                this.timerButtons.forEach(b => b.classList.remove('active'));
                // Add active class to clicked button
                e.target.classList.add('active');
                // Update selected timer value
                this.selectedTimerValue = parseInt(e.target.dataset.timer);
            });
        });

        // Camera selection
        this.cameraSelect.addEventListener('change', async (e) => {
            this.settings.selectedCamera = e.target.value;
            if (e.target.value) {
                await this.initCamera();
            }
        });

        // Preview controls
        this.printPreviewBtn.addEventListener('click', () => {
            this.printPhoto();
        });

        this.retakePreviewBtn.addEventListener('click', () => {
            this.hidePreview();
        });

        // Settings form
        document.getElementById('resolutionSelect').addEventListener('change', (e) => {
            this.settings.resolution = e.target.value;
            this.updateResolution();
        });

        this.printerSelect.addEventListener('change', (e) => {
            this.settings.selectedPrinter = e.target.value;
            this.updatePrinterStatus();
        });

        document.getElementById('autoPrint').addEventListener('change', (e) => {
            this.settings.autoPrint = e.target.checked;
        });

        document.getElementById('printCopies').addEventListener('change', (e) => {
            this.settings.printCopies = parseInt(e.target.value);
        });

        document.getElementById('paperSizeSelect').addEventListener('change', (e) => {
            this.settings.paperSize = e.target.value;
        });

        document.getElementById('printQualitySelect').addEventListener('change', (e) => {
            this.settings.printQuality = e.target.value;
        });

        // Close modal when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.style.display = 'none';
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                if (this.isCapturing) {
                    this.cancelCapture();
                } else {
                    this.startCapture();
                }
            } else if (e.code === 'Escape') {
                if (this.isCapturing) {
                    this.cancelCapture();
                } else {
                    document.querySelectorAll('.modal').forEach(modal => {
                        modal.style.display = 'none';
                    });
                }
            }
        });
    }

    async startCapture() {
        if (this.isCapturing) return;
        
        // Set capturing state
        this.isCapturing = true;
        this.updateCaptureButton();
        
        // Start multi-photo session
        this.isMultiPhotoSession = true;
        this.currentPhotoIndex = 0;
        this.capturedPhotos = [];
        
        // Show progress UI
        this.showPhotoProgress();
        
        // Start capturing photos one by one
        await this.captureNextPhoto();
    }

    cancelCapture() {
        // Clear any timeouts
        if (this.captureTimeout) {
            clearTimeout(this.captureTimeout);
            this.captureTimeout = null;
        }
        
        // Reset states
        this.isCapturing = false;
        this.isMultiPhotoSession = false;
        this.currentPhotoIndex = 0;
        this.capturedPhotos = [];
        
        // Hide UI elements
        this.hidePhotoProgress();
        this.timer.style.display = 'none';
        
        // Update button
        this.updateCaptureButton();
    }

    updateCaptureButton() {
        if (this.isCapturing) {
            this.captureBtn.innerHTML = '❌ Hủy chụp';
            this.captureBtn.classList.remove('btn-primary');
            this.captureBtn.classList.add('btn-danger');
        } else {
            this.captureBtn.innerHTML = '📷 Chụp 4 ảnh';
            this.captureBtn.classList.remove('btn-danger');
            this.captureBtn.classList.add('btn-primary');
        }
    }

    showCountdown(seconds) {
        return new Promise((resolve, reject) => {
            if (!this.isCapturing) {
                reject(new Error('Capture cancelled'));
                return;
            }
            
            this.timer.style.display = 'block';
            this.timer.textContent = seconds;
            
            const countdown = setInterval(() => {
                if (!this.isCapturing) {
                    this.timer.style.display = 'none';
                    clearInterval(countdown);
                    reject(new Error('Capture cancelled'));
                    return;
                }
                
                seconds--;
                if (seconds > 0) {
                    this.timer.textContent = seconds;
                } else {
                    this.timer.style.display = 'none';
                    clearInterval(countdown);
                    resolve();
                }
            }, 1000);
        });
    }

    showPhotoProgress() {
        this.photoProgress.style.display = 'block';
        this.updatePhotoProgress();
    }

    hidePhotoProgress() {
        this.photoProgress.style.display = 'none';
    }

    updatePhotoProgress() {
        const photoNumber = this.currentPhotoIndex + 1;
        this.currentPhotoNumber.textContent = photoNumber;
        
        // Update progress bar
        const progressPercent = (this.currentPhotoIndex / 4) * 100;
        this.progressFill.style.width = progressPercent + '%';
        
        // Update photo slots
        for (let i = 1; i <= 4; i++) {
            const slot = document.getElementById(`slot${i}`);
            slot.classList.remove('current', 'completed');
            
            if (i <= this.currentPhotoIndex) {
                slot.classList.add('completed');
            } else if (i === photoNumber) {
                slot.classList.add('current');
            }
        }
    }

    async captureNextPhoto() {
        if (!this.isCapturing) return;
        
        const photoNumber = this.currentPhotoIndex + 1;
        
        // Update UI
        this.updatePhotoProgress();
        
        // Wait a bit for user to see the progress
        this.captureTimeout = setTimeout(async () => {
            if (!this.isCapturing) return;
            
            try {
                // Show countdown
                const timerValue = this.selectedTimerValue;
                if (timerValue > 0) {
                    this.hidePhotoProgress();
                    await this.showCountdown(timerValue);
                    if (!this.isCapturing) return;
                    this.showPhotoProgress();
                    this.updatePhotoProgress();
                }
                
                // Capture the photo
                await this.captureSinglePhoto();
                
                if (!this.isCapturing) return;
                
                // Move to next photo or finish
                this.currentPhotoIndex++;
                
                if (this.currentPhotoIndex < 4) {
                    // Capture next photo
                    await this.captureNextPhoto();
                } else {
                    // All photos captured, apply template
                    this.hidePhotoProgress();
                    await this.applyTemplateWithMultiplePhotos();
                }
            } catch (error) {
                if (error.message !== 'Capture cancelled') {
                    console.error('Error in capture process:', error);
                }
                this.cancelCapture();
            }
        }, 1500);
    }

    async captureSinglePhoto() {
        try {
            // Draw video frame to canvas
            this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
            
            // Get image data
            const imageData = this.canvas.toDataURL('image/png');
            
            // Store photo
            this.capturedPhotos.push(imageData);
            
            // Flash effect
            this.showFlashEffect();
            
            // Brief pause after capture
            await new Promise(resolve => setTimeout(resolve, 500));
            
        } catch (error) {
            console.error('Error capturing photo:', error);
            alert('Lỗi khi chụp ảnh!');
        }
    }

    async applyTemplateWithMultiplePhotos() {
        try {
            // Get Classic Strip template
            const result = await ipcRenderer.invoke('apply-template', {
                photoDataUrls: this.capturedPhotos, // Send all photos
                templateName: 'classic_strip'
            });

            if (result.success) {
                // Create a new canvas for template processing
                const templateCanvas = document.createElement('canvas');
                const ctx = templateCanvas.getContext('2d');
                const template = result.template;
                
                templateCanvas.width = template.width;
                templateCanvas.height = template.height;
                
                // Draw background
                ctx.fillStyle = template.backgroundColor || '#ffffff';
                ctx.fillRect(0, 0, template.width, template.height);
                
                // Load all photos and draw them
                const photoPromises = this.capturedPhotos.map((photoData, index) => {
                    return new Promise(resolve => {
                        const photoImg = new Image();
                        photoImg.onload = () => resolve({ img: photoImg, index });
                        photoImg.src = photoData;
                    });
                });
                
                Promise.all(photoPromises).then(loadedPhotos => {
                    // Draw each photo in its corresponding slot
                    loadedPhotos.forEach(({ img, index }) => {
                        if (template.photoSlots[index]) {
                            const slot = template.photoSlots[index];
                            ctx.drawImage(
                                img,
                                slot.x, slot.y,
                                slot.width, slot.height
                            );
                            
                            // Add border if specified
                            if (slot.border) {
                                ctx.strokeStyle = slot.border.color;
                                ctx.lineWidth = slot.border.width;
                                ctx.strokeRect(slot.x, slot.y, slot.width, slot.height);
                            }
                        }
                    });
                    
                    // Add text elements
                    if (template.texts) {
                        template.texts.forEach(text => {
                            ctx.font = `${text.size}px ${text.font}`;
                            ctx.fillStyle = text.color;
                            ctx.textAlign = text.align || 'left';
                            ctx.fillText(text.content, text.x, text.y);
                        });
                    }
                    
                    // Get final image data
                    const finalImageData = templateCanvas.toDataURL('image/png');
                    this.currentPhotoDataUrl = finalImageData;
                    
                    // Save the final image
                    ipcRenderer.invoke('save-final-image', finalImageData).then(saveResult => {
                        if (saveResult.success) {
                            this.currentPhoto = saveResult.filepath;
                            this.showPreview(finalImageData);
                            
                            // Auto print if enabled
                            if (this.settings.autoPrint) {
                                setTimeout(() => this.printPhoto(), 1000);
                            }
                        }
                    });
                });
            }
        } catch (error) {
            console.error('Error applying template with multiple photos:', error);
            alert('Lỗi khi áp dụng template!');
        } finally {
            // Reset multi-photo session
            this.isMultiPhotoSession = false;
            this.isCapturing = false;
            this.updateCaptureButton();
        }
    }

    async capturePhoto() {
        try {
            // Draw video frame to canvas
            this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
            
            // Get image data
            const imageData = this.canvas.toDataURL('image/png');
            this.currentPhotoDataUrl = imageData;
            
            // Save photo
            const result = await ipcRenderer.invoke('capture-photo', imageData);
            
            if (result.success) {
                this.currentPhoto = result.filepath;
                
                // Flash effect
                this.showFlashEffect();
                
                // Auto apply Classic Strip template
                await this.autoApplyClassicStrip(imageData);
                
                // Auto print if enabled
                if (this.settings.autoPrint) {
                    setTimeout(() => this.printPhoto(), 1000);
                }
            } else {
                alert('Lỗi khi lưu ảnh: ' + result.error);
            }
        } catch (error) {
            console.error('Error capturing photo:', error);
            alert('Lỗi khi chụp ảnh!');
        }
    }

    showFlashEffect() {
        const flash = document.createElement('div');
        flash.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: white;
            z-index: 9999;
            opacity: 0.8;
            pointer-events: none;
        `;
        document.body.appendChild(flash);
        
        setTimeout(() => {
            flash.style.opacity = '0';
            flash.style.transition = 'opacity 0.3s';
            setTimeout(() => document.body.removeChild(flash), 300);
        }, 100);
    }

    async autoApplyClassicStrip(imageData) {
        try {
            // Get Classic Strip template
            const result = await ipcRenderer.invoke('apply-template', {
                photoDataUrl: imageData,
                templateName: 'classic_strip'
            });

            if (result.success) {
                // Create a new canvas for template processing
                const templateCanvas = document.createElement('canvas');
                const ctx = templateCanvas.getContext('2d');
                const template = result.template;
                
                templateCanvas.width = template.width;
                templateCanvas.height = template.height;
                
                // Draw background
                ctx.fillStyle = template.backgroundColor || '#ffffff';
                ctx.fillRect(0, 0, template.width, template.height);
                
                // Load and draw the photo
                const photoImg = new Image();
                photoImg.onload = () => {
                    // Draw photo in each slot
                    template.photoSlots.forEach(slot => {
                        ctx.drawImage(
                            photoImg,
                            slot.x, slot.y,
                            slot.width, slot.height
                        );
                        
                        // Add border if specified
                        if (slot.border) {
                            ctx.strokeStyle = slot.border.color;
                            ctx.lineWidth = slot.border.width;
                            ctx.strokeRect(slot.x, slot.y, slot.width, slot.height);
                        }
                    });
                    
                    // Add text elements
                    if (template.texts) {
                        template.texts.forEach(text => {
                            ctx.font = `${text.size}px ${text.font}`;
                            ctx.fillStyle = text.color;
                            ctx.textAlign = text.align || 'left';
                            ctx.fillText(text.content, text.x, text.y);
                        });
                    }
                    
                    // Get final image data
                    const finalImageData = templateCanvas.toDataURL('image/png');
                    
                    // Save the final image
                    ipcRenderer.invoke('save-final-image', finalImageData).then(saveResult => {
                        if (saveResult.success) {
                            this.currentPhoto = saveResult.filepath;
                            this.showPreview(finalImageData);
                        }
                    });
                };
                
                photoImg.src = imageData;
            }
        } catch (error) {
            console.error('Error auto-applying Classic Strip:', error);
            // Fallback to showing original photo
            this.showPreview(imageData);
        }
    }

    showPreview(imageData) {
        // Hide placeholder and show image
        this.photoPreview.innerHTML = `<img src="${imageData}" alt="Photo Preview">`;
        this.previewControls.style.display = 'flex';
    }

    hidePreview() {
        // Show placeholder and hide controls
        this.photoPreview.innerHTML = `
            <div class="preview-placeholder">
                <p>📸 Chụp ảnh để xem kết quả</p>
            </div>
        `;
        this.previewControls.style.display = 'none';
        this.currentPhoto = null;
        this.currentPhotoDataUrl = null;
        
        // Reset multi-photo session
        this.capturedPhotos = [];
        this.currentPhotoIndex = 0;
        this.isMultiPhotoSession = false;
        this.hidePhotoProgress();
    }

    async printPhoto() {
        if (!this.currentPhoto) {
            alert('Không có ảnh để in!');
            return;
        }

        if (!this.settings.selectedPrinter) {
            alert('Vui lòng chọn máy in trong cài đặt!');
            return;
        }

        try {
            const printOptions = {
                imagePath: this.currentPhoto,
                printerName: this.settings.selectedPrinter,
                paperSize: this.settings.paperSize,
                quality: this.settings.printQuality,
                copies: this.settings.printCopies
            };

            for (let i = 0; i < this.settings.printCopies; i++) {
                const result = await ipcRenderer.invoke('print-photo', printOptions);
                if (!result.success) {
                    alert('Lỗi khi in ảnh: ' + result.error);
                    break;
                }
            }
            
            if (this.settings.printCopies === 1) {
                alert(`Đã gửi ảnh đến máy in "${this.settings.selectedPrinter}"!`);
            } else {
                alert(`Đã gửi ${this.settings.printCopies} bản in đến máy in "${this.settings.selectedPrinter}"!`);
            }
        } catch (error) {
            console.error('Error printing photo:', error);
            alert('Lỗi khi in ảnh!');
        }
    }

    updateResolution() {
        const [width, height] = this.settings.resolution.split('x').map(Number);
        
        if (this.video.srcObject) {
            const tracks = this.video.srcObject.getVideoTracks();
            tracks.forEach(track => {
                track.applyConstraints({
                    width: { ideal: width },
                    height: { ideal: height }
                });
            });
        }
    }

    updateCameraStatus(connected) {
        const cameraStatus = document.getElementById('cameraStatus');
        if (connected) {
            cameraStatus.textContent = '📹 Camera: Connected';
            cameraStatus.style.color = '#48bb78';
        } else {
            cameraStatus.textContent = '📹 Camera: Disconnected';
            cameraStatus.style.color = '#f56565';
        }
    }

    updatePrinterStatus() {
        const printerStatus = document.getElementById('printerStatus');
        if (this.settings.selectedPrinter) {
            const selectedPrinter = this.printers.find(p => p.name === this.settings.selectedPrinter);
            if (selectedPrinter) {
                printerStatus.textContent = `🖨️ ${selectedPrinter.name}: ${selectedPrinter.status}`;
                printerStatus.style.color = selectedPrinter.status === 'OK' ? '#48bb78' : '#f56565';
            }
        } else {
            printerStatus.textContent = '🖨️ Printer: Chưa chọn';
            printerStatus.style.color = '#f56565';
        }
    }

    updateStatus() {
        this.updatePrinterStatus();
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PhotoBoothApp();
});

// Handle app errors
window.addEventListener('error', (e) => {
    console.error('Application error:', e.error);
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled promise rejection:', e.reason);
});
