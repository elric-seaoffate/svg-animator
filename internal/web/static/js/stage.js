['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
  document.addEventListener(evt, e => e.preventDefault(), false);
});

window.Stage = {
  activePlacement: 'start',

  init(onPlaceCallback, onFileLoadedCallback) {
    this.previewBox = document.getElementById('previewBox');
    this.uploadDrop = document.getElementById('uploadDrop');
    this.fileInput = document.getElementById('fileInput');

    if (this.previewBox) {
      this.previewBox.addEventListener('click', (e) => {
        const rect = this.previewBox.getBoundingClientRect();
        const x = Math.round(Math.min(Math.max(0, (e.clientX - rect.left) / rect.width), 1) * 100);
        const y = Math.round(Math.min(Math.max(0, (e.clientY - rect.top) / rect.height), 1) * 100);
        onPlaceCallback(this.activePlacement, x, y);
      });
    }

    if (this.uploadDrop) {
      this.uploadDrop.addEventListener('dragover', () => this.uploadDrop.classList.add('drag-active'));
      this.uploadDrop.addEventListener('dragleave', () => this.uploadDrop.classList.remove('drag-active'));
      this.uploadDrop.addEventListener('drop', (e) => {
        this.uploadDrop.classList.remove('drag-active');
        if (e.dataTransfer && e.dataTransfer.files.length) {
          this.loadFile(e.dataTransfer.files[0], onFileLoadedCallback);
        }
      });
    }

    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
          this.loadFile(e.target.files[0], onFileLoadedCallback);
          this.fileInput.value = ''; 
        }
      });
    }
  },

  setActive(target) {
    this.activePlacement = target;
    const btnStart = document.getElementById('btnModeStart'), btnEnd = document.getElementById('btnModeEnd');
    const retS = document.getElementById('reticleStart'), retE = document.getElementById('reticleEnd');
    if (btnStart && btnEnd && retS && retE) {
      btnStart.className = target === 'start' ? 'mode-btn active-start' : 'mode-btn';
      btnEnd.className = target === 'end' ? 'mode-btn active-end' : 'mode-btn';
      retS.classList.toggle('active-reticle', target === 'start');
      retE.classList.toggle('active-reticle', target === 'end');
    }
  },

  updateReticles(sX, sY, eX, eY) {
    const retS = document.getElementById('reticleStart'), retE = document.getElementById('reticleEnd'), line = document.getElementById('flightLine');
    if (retS) { retS.style.left = sX + '%'; retS.style.top = sY + '%'; }
    if (retE) { retE.style.left = eX + '%'; retE.style.top = eY + '%'; }
    if (line) { line.setAttribute('x1', sX + '%'); line.setAttribute('y1', sY + '%'); line.setAttribute('x2', eX + '%'); line.setAttribute('y2', eY + '%'); }
  },

  loadFile(file, callback) {
    if (!file) return;
    if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
      alert('Please choose a valid image file (JPEG, PNG, WEBP).'); return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const img = new Image();
      img.onload = () => {
        callback({
          filename: file.name.replace(/\.[^/.]+$/, ""),
          mime: file.type || 'image/jpeg',
          b64: dataUrl.split(',')[1],
          width: img.naturalWidth,
          height: img.naturalHeight
        });
      };
      img.onerror = () => alert('Failed to decode image data.');
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }
};