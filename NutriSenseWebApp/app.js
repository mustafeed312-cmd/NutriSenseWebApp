import { GoogleGenAI } from "https://unpkg.com/@google/genai@0.0.9/dist/index.js";

// --- CONFIGURATION ---
// YOUR SECURE GEMINI API KEY HAS BEEN INSERTED HERE
const GEMINI_API_KEY = "AIzaSyCvC6gT4scvG56JMk2I3orAy6K-wOw-P9M"; 
const MODEL_NAME = "gemini-2.5-flash";

// Initialize the GoogleGenAI client
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// --- DOM ELEMENTS ---
const elements = {
    // Screens
    'screen-splash': document.getElementById('screen-splash'),
    'screen-home': document.getElementById('screen-home'),
    'screen-camera': document.getElementById('screen-camera'),
    'screen-result': document.getElementById('screen-result'),
    'screen-history': document.getElementById('screen-history'),

    // Camera
    video: document.getElementById('video'),
    snapCanvas: document.getElementById('snapCanvas'),
    snapPreview: document.getElementById('snapPreview'),
    captureBtn: document.getElementById('captureBtn'),
    cameraBack: document.getElementById('cameraBack'),

    // Result
    resultBack: document.getElementById('resultBack'),
    preview: document.getElementById('preview'),
    foodName: document.getElementById('foodName'),
    confidence: document.getElementById('confidence'),
    calorieVal: document.getElementById('calorieVal'),
    proteinVal: document.getElementById('proteinVal'),
    fatVal: document.getElementById('fatVal'),
    btnLog: document.getElementById('btnLog'),
    btnRetake: document.getElementById('btnRetake'),

    // History
    recentList: document.getElementById('recentList'),
    historyList: document.getElementById('historyList'),

    // Stats
    statTotalMeals: document.getElementById('stat-total-meals'),

    // Buttons
    btnDashboard: document.getElementById('btnDashboard'),
    btnHistory: document.getElementById('btnHistory'),
    btnOpenCameraHeader: document.getElementById('btnOpenCameraHeader'),
    btnOpenCamera: document.getElementById('btnOpenCamera'),
    btnAddManual: document.getElementById('btnAddManual'),
    btnOpenHistoryMain: document.getElementById('btnOpenHistoryMain'),
    fabScan: document.getElementById('fabScan'),
    fabManual: document.getElementById('fabManual'),
    fabHistory: document.getElementById('fabHistory'),
    fab: document.getElementById('fab'),
    fabMenu: document.getElementById('fabMenu'),
};

let stream = null;
let lastCapturedImageBase64 = null;
let totalMeals = 0;

// --- CORE FUNCTIONS ---

function showScreen(id) {
    document.querySelectorAll(".screen").forEach(screen => {
        screen.classList.remove("active");
        screen.classList.add("hidden");
    });

    const target = document.getElementById(id);
    if (!target) return;
    target.classList.remove("hidden");

    setTimeout(() => {
        target.classList.add("active");
    }, 50);
}

function goHome() {
    stopCamera();
    showScreen("screen-home");
}

function goCamera() {
    showScreen("screen-camera");
    startCamera();
}

function goHistory() {
    stopCamera();
    showScreen("screen-history");
}

function manualMeal() {
    const meal = prompt("Enter meal name:");
    if (meal) {
        // Placeholder values for manual entry
        addToHistory(meal, '150', '10', '5', 'N/A'); 
        goHistory();
    }
}

function addToHistory(name, calories, protein, fat, confidence) {
    totalMeals++;
    elements.statTotalMeals.textContent = totalMeals;
    
    // Add to History Screen List
    const list = elements.historyList;
    const item = document.createElement("div");
    item.className = 'history-item';
    item.innerHTML = `
        <div class="history-left">
            <div class="item-thumb"></div>
            <div class="item-info">
                <div class="item-title">${name}</div>
                <div class="item-meta">Logged: ${new Date().toLocaleDateString()} · AI Confidence: ${confidence}%</div>
            </div>
        </div>
        <div class="item-stats">
            <div class="metric-value">${calories}</div>
            <div class="metric-label">Cal</div>
        </div>
    `;
    list.prepend(item); // Add to the top
    
    // Add to Recent Meals on Home Screen
    const recentItem = document.createElement("div");
    recentItem.className = 'recent-item';
    recentItem.innerHTML = `
        <div class="recent-thumb"></div>
        <div class="recent-info">
            <div class="recent-title">${name}</div>
            <div class="recent-meta">${calories} Cal • ${protein}g P • ${fat}g F</div>
        </div>
    `;
    elements.recentList.prepend(recentItem);
}


// --- CAMERA LOGIC ---

async function startCamera() {
    try {
        // Use 'environment' for back camera on mobile devices
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        elements.video.srcObject = stream;
        elements.video.play();
    } catch (err) {
        document.getElementById('camMessage').textContent = "Camera access denied or not available. Cannot use Scan feature.";
        console.error("Error accessing camera: ", err);
        showToast("Error: Camera access required for scan feature.", 5000);
    }
}

function stopCamera() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
}

function captureImage() {
    const video = elements.video;
    const canvas = elements.snapCanvas;
    const context = canvas.getContext('2d');

    // Set canvas dimensions to video feed's dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw the current video frame onto the canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convert the canvas content to a Base64 image string (JPEG format)
    lastCapturedImageBase64 = canvas.toDataURL('image/jpeg', 0.8);
    
    // Display the captured image in the preview area
    elements.preview.innerHTML = `<img src="${lastCapturedImageBase64}" alt="Captured Food" style="width:100%; height:100%; object-fit:cover; border-radius:12px;" />`;
    
    // Move to result screen and start analysis
    showScreen("screen-result");
    stopCamera();
    analyzeFoodWithGemini(lastCapturedImageBase64);
}

// --- GEMINI API INTEGRATION ---

/**
 * Converts a Base64 image string into a Part object for the Gemini API.
 */
function getBase64ImagePart(base64String) {
    if (!base64String) return null;
    const [metadata, data] = base64String.split(',');
    const mimeTypeMatch = metadata.match(/data:(.*?);/);
    const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';
    
    return {
        inlineData: {
            data: data,
            mimeType: mimeType,
        }
    };
}

/**
 * Calls the Gemini API to analyze the food image and get structured nutrition data.
 */
async function analyzeFoodWithGemini(base64Image) {
    // Reset result screen and disable log button during analysis
    elements.foodName.textContent = "Analyzing...";
    elements.confidence.textContent = "AI Confidence: —%";
    elements.calorieVal.textContent = "—";
    elements.proteinVal.textContent = "—";
    elements.fatVal.textContent = "—";
    elements.btnLog.disabled = true;

    try {
        if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY") {
             throw new Error("API Key not set. Please replace 'YOUR_GEMINI_API_KEY' in app.js.");
        }
        
        const imagePart = getBase64ImagePart(base64Image);
        if (!imagePart) throw new Error("Could not process image data.");
        
        // Define the structured output format (JSON Schema)
        const responseSchema = {
            type: "object",
            properties: {
                foodName: { type: "string", description: "The main food item identified." },
                calories: { type: "integer", description: "Estimated total calories for the visible portion." },
                proteinGrams: { type: "number", description: "Estimated protein in grams." },
                fatGrams: { type: "number", description: "Estimated fat in grams." },
                confidencePercent: { type: "integer", description: "AI's confidence in the analysis, from 0 to 100." }
            },
            required: ["foodName", "calories", "proteinGrams", "fatGrams", "confidencePercent"]
        };

        const prompt = "You are an expert nutritionist. Analyze the food item in the image and provide the estimated nutritional information for the visible portion. Be precise with the food name, and provide the confidence level.";

        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: [imagePart, prompt],
            config: {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                temperature: 0.1, 
            },
        });

        const jsonText = response.text.trim();
        const analysis = JSON.parse(jsonText);
        
        // --- Display Results ---
        elements.foodName.textContent = analysis.foodName || "Unknown Food";
        elements.confidence.textContent = `AI Confidence: ${analysis.confidencePercent || 0}%`;
        elements.calorieVal.textContent = analysis.calories ? analysis.calories.toFixed(0) : '—';
        elements.proteinVal.textContent = analysis.proteinGrams ? analysis.proteinGrams.toFixed(1) : '—';
        elements.fatVal.textContent = analysis.fatGrams ? analysis.fatGrams.toFixed(1) : '—';
        elements.btnLog.disabled = false;
        
        // Store the full analysis object for logging
        elements.btnLog.dataset.analysis = jsonText;

    } catch (error) {
        console.error("Gemini API Error:", error);
        elements.foodName.textContent = "Analysis Failed 😔";
        elements.confidence.textContent = "Check console for error.";
        elements.btnLog.dataset.analysis = JSON.stringify({foodName: "Failed Scan", calories: 0, proteinGrams: 0, fatGrams: 0, confidencePercent: 0});
        elements.btnLog.disabled = false; // Allow logging failure
        showToast("Error during analysis. See console for details.", 5000);
    }
}

// --- TOAST NOTIFICATION ---

function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, duration);
}

// --- EVENT LISTENERS (BINDINGS) ---

function initAppBindings() {
    // Initial navigation
    window.onload = () => {
        setTimeout(() => {
            showScreen("screen-home");
        }, 1500);
    };

    // Nav Bar Buttons
    elements.btnDashboard.addEventListener('click', goHome);
    elements.btnHistory.addEventListener('click', goHistory);
    elements.btnOpenCameraHeader.addEventListener('click', goCamera);

    // Home Screen Buttons
    elements.btnOpenCamera.addEventListener('click', goCamera);
    elements.btnAddManual.addEventListener('click', manualMeal);
    elements.btnOpenHistoryMain.addEventListener('click', goHistory);

    // Camera Screen Buttons
    elements.cameraBack.addEventListener('click', goHome);
    elements.captureBtn.addEventListener('click', captureImage);

    // Result Screen Buttons
    elements.resultBack.addEventListener('click', goHome);
    elements.btnRetake.addEventListener('click', goCamera);
    elements.btnLog.addEventListener('click', () => {
        const analysisString = elements.btnLog.dataset.analysis;
        if (analysisString) {
            const analysis = JSON.parse(analysisString);
            addToHistory(
                analysis.foodName,
                analysis.calories.toFixed(0),
                analysis.proteinGrams.toFixed(1),
                analysis.fatGrams.toFixed(1),
                analysis.confidencePercent
            );
            goHistory();
            showToast(`Logged: ${analysis.foodName} (${analysis.calories.toFixed(0)} Cal)`);
        }
    });
    
    // Floating Action Button (FAB)
    elements.fab.addEventListener('click', () => {
        elements.fabMenu.classList.toggle('hidden');
        elements.fab.querySelector('.material-icons').textContent = elements.fabMenu.classList.contains('hidden') ? 'bolt' : 'close';
    });
    elements.fabScan.addEventListener('click', goCamera);
    elements.fabManual.addEventListener('click', manualMeal);
    elements.fabHistory.addEventListener('click', goHistory);
}

// Start the application
initAppBindings();