// Dynamically fetches and injects the modal HTML into the main document
async function initExportStudio() {
    try {
        const response = await fetch('export-modal.html');
        const html = await response.text();
        const container = document.getElementById('export-modal-container');
        if (container) {
            container.innerHTML = html;
        }
    } catch (err) {
        console.error("Failed to load export modal:", err);
    }
}

// Initialize when the script is loaded
document.addEventListener('DOMContentLoaded', initExportStudio);

function openExportModal() {
    // Relies on your global currentRenderState object
    document.getElementById('expWidth').value = currentRenderState.image.width;
    document.getElementById('expHeight').value = currentRenderState.image.height;
    document.getElementById('exportModal').style.display = 'flex';
}

function closeExportModal() {
    document.getElementById('exportModal').style.display = 'none';
}

function buildExportPayload() {
    const payloadState = JSON.parse(JSON.stringify(currentRenderState));
    
    payloadState.image.width = parseInt(document.getElementById('expWidth').value, 10);
    payloadState.image.height = parseInt(document.getElementById('expHeight').value, 10);
    payloadState.loop = document.getElementById('expLoop').value;

    if (!document.getElementById('expEnableOptical').checked) {
        payloadState.optical.type = "none";
        payloadState.camera.motion = "none";
    }
    
    // Add logic here if you store overlays in a specific object (e.g., payloadState.overlays.fx = "none")
    if (!document.getElementById('expEnableOverlays').checked) {
        // payloadState.overlays.fx = "none"; 
    }
    
    if (!document.getElementById('expEnableFrame').checked) {
        payloadState.overlays.frame = false;
    }

    return {
        format: document.getElementById('expFormat').value,
        duration: payloadState.duration,
        fps: parseInt(document.getElementById('expFps').value, 10),
        state: payloadState
    };
}

async function generatePreview() {
    const placeholder = document.getElementById('previewPlaceholder');
    const previewImg = document.getElementById('previewImage');
    
    placeholder.innerText = "Rendering preview... (Kiwiberry is thinking)";
    placeholder.style.display = 'block';
    previewImg.style.display = 'none';
    
    if (previewImg.src && previewImg.src.startsWith('blob:')) {
        URL.revokeObjectURL(previewImg.src);
    }

    try {
        const payload = buildExportPayload();
        const response = await fetch('/api/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error("Server failed to render");

        const blob = await response.blob();
        const ramUrl = URL.createObjectURL(blob);
        
        previewImg.src = ramUrl;
        previewImg.style.display = 'block';
        placeholder.style.display = 'none';
        
    } catch (err) {
        placeholder.innerText = "Preview failed: " + err.message;
    }
}

async function downloadFinal() {
    const btn = document.querySelector('.btn-primary');
    btn.innerText = "Rendering...";
    btn.disabled = true;

    try {
        const payload = buildExportPayload();
        const response = await fetch('/api/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error("Server failed to render");

        const blob = await response.blob();
        const ramUrl = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = ramUrl;
        
        const ext = payload.format === 'webp' ? '.webp' : '.png';
        const filename = document.getElementById('expFilename').value || 'animation';
        a.download = filename + ext;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        setTimeout(() => URL.revokeObjectURL(ramUrl), 1000);
        
    } catch (err) {
        alert("Export failed: " + err.message);
    } finally {
        btn.innerText = "Download Final File";
        btn.disabled = false;
    }
}