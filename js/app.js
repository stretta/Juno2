const RNBO_CONFIG = {
    patchExportURL: "export/patch.export.json",
    dependenciesURL: "export/dependencies.json",
    manifestURL: "export/export-manifest.json",
    titleSelector: "#patcher-title",
    useTemplateUI: false
};

async function setup() {
    const exportURLs = await resolvePatchExportURLs();
    const patcher = await loadPatcher(exportURLs.patchExportURL);
    const context = createAudioContext();
    const outputNode = context.createGain();
    outputNode.connect(context.destination);

    await ensureRNBOLoaded(patcher);

    const device = await createDevice(context, patcher);
    const dependencies = await loadDependencies(exportURLs.dependenciesURL);

    if (dependencies.length) {
        await device.loadDataBufferDependencies(dependencies);
    }

    device.node.connect(outputNode);
    setPatcherTitle(patcher);
    installAudioResume(context);

    const app = {
        context,
        device,
        outputNode,
        patcher,
        dependencies,
        exportURLs,
        config: RNBO_CONFIG
    };

    window.rnboApp = app;
    window.dispatchEvent(new CustomEvent("rnbo-ready", { detail: app }));

    if (RNBO_CONFIG.useTemplateUI) {
        mountTemplateUI(app);
    }

    if (typeof guardrails === "function") {
        guardrails();
    }
}

function createAudioContext() {
    const WAContext = window.AudioContext || window.webkitAudioContext;
    return new WAContext();
}

async function resolvePatchExportURLs() {
    const manifest = await loadExportManifest(RNBO_CONFIG.manifestURL);
    const patchExportURL = manifest.patchExportURL || RNBO_CONFIG.patchExportURL;
    const dependenciesURL = manifest.dependenciesURL || buildSiblingURL(patchExportURL, "dependencies.json");

    return {
        patchExportURL,
        dependenciesURL
    };
}

async function loadExportManifest(manifestURL) {
    try {
        const response = await fetch(manifestURL, { cache: "no-store" });
        if (!response.ok) {
            return {};
        }

        return await response.json();
    } catch (err) {
        return {};
    }
}

function buildSiblingURL(fileURL, siblingName) {
    const lastSlashIndex = fileURL.lastIndexOf("/");
    if (lastSlashIndex < 0) {
        return siblingName;
    }

    return fileURL.slice(0, lastSlashIndex + 1) + siblingName;
}

async function loadPatcher(patchExportURL) {
    let response;

    try {
        response = await fetch(patchExportURL, { cache: "no-store" });

        if (!response.ok) {
            throw new Error(`Failed to fetch patch export (${response.status})`);
        }

        return await response.json();
    } catch (err) {
        handleSetupError(err, response, patchExportURL);
        throw err;
    }
}

async function ensureRNBOLoaded(patcher) {
    if (window.RNBO) {
        return;
    }

    await loadRNBOScript(patcher.desc.meta.rnboversion);
}

async function createDevice(context, patcher) {
    try {
        return await RNBO.createDevice({ context, patcher });
    } catch (err) {
        handleSetupError(err);
        throw err;
    }
}

async function loadDependencies(dependenciesURL) {
    try {
        const response = await fetch(dependenciesURL, { cache: "no-store" });
        if (!response.ok) {
            return [];
        }

        const dependencies = await response.json();
        return dependencies.map((dependency) => {
            if (!dependency.file) {
                return dependency;
            }

            return Object.assign({}, dependency, {
                file: "export/" + dependency.file
            });
        });
    } catch (err) {
        return [];
    }
}

function handleSetupError(err, response, patchExportURL) {
    const errorContext = {
        error: err
    };

    if (response && (response.status >= 300 || response.status < 200)) {
        errorContext.header = "Couldn't load patcher export bundle";
        errorContext.description =
            "Check js/app.js to see what file it's trying to load. Currently it's " +
            `trying to load "${patchExportURL}". If that doesn't match the ` +
            "name of the file you exported from RNBO, update RNBO_CONFIG.patchExportURL.";
    }

    if (typeof guardrails === "function") {
        guardrails(errorContext);
    }
}

function installAudioResume(context) {
    document.body.addEventListener("pointerdown", () => {
        context.resume();
    }, { once: true });
}

function setPatcherTitle(patcher) {
    const titleElement = document.querySelector(RNBO_CONFIG.titleSelector);

    if (!titleElement) {
        return;
    }

    const filename = patcher.desc.meta.filename || "Unnamed patcher";
    titleElement.innerText = `${filename} (v${patcher.desc.meta.rnboversion})`;
}

function loadRNBOScript(version) {
    return new Promise((resolve, reject) => {
        if (/^\d+\.\d+\.\d+-dev$/.test(version)) {
            reject(new Error("Patcher exported with a Debug Version. Specify the correct RNBO version to use in the code."));
            return;
        }

        const el = document.createElement("script");
        el.src = "https://c74-public.nyc3.digitaloceanspaces.com/rnbo/" + encodeURIComponent(version) + "/rnbo.min.js";
        el.onload = resolve;
        el.onerror = function(err) {
            reject(new Error("Failed to load rnbo.js v" + version + ": " + err.type));
        };
        document.body.append(el);
    });
}

function mountTemplateUI(app) {
    makeSliders(app.device);
    makeInportForm(app.device);
    attachOutports(app.device);
    loadPresets(app.device, app.patcher);
    makeMIDIKeyboard(app.device);
}

function makeSliders(device) {
    const pdiv = document.getElementById("rnbo-parameter-sliders");
    const noParamLabel = document.getElementById("no-param-label");

    if (!pdiv) {
        return;
    }

    if (noParamLabel && device.numParameters > 0) {
        pdiv.removeChild(noParamLabel);
    }

    let isDraggingSlider = false;
    const uiElements = {};

    device.parameters.forEach((param) => {
        const label = document.createElement("label");
        const slider = document.createElement("input");
        const text = document.createElement("input");
        const sliderContainer = document.createElement("div");

        sliderContainer.appendChild(label);
        sliderContainer.appendChild(slider);
        sliderContainer.appendChild(text);

        label.setAttribute("name", param.name);
        label.setAttribute("for", param.name);
        label.setAttribute("class", "param-label");
        label.textContent = `${param.name}: `;

        slider.setAttribute("type", "range");
        slider.setAttribute("class", "param-slider");
        slider.setAttribute("id", param.id);
        slider.setAttribute("name", param.name);
        slider.setAttribute("min", param.min);
        slider.setAttribute("max", param.max);
        if (param.steps > 1) {
            slider.setAttribute("step", (param.max - param.min) / (param.steps - 1));
        } else {
            slider.setAttribute("step", (param.max - param.min) / 1000.0);
        }
        slider.setAttribute("value", param.value);

        text.setAttribute("value", param.value.toFixed(1));
        text.setAttribute("type", "text");

        slider.addEventListener("pointerdown", () => {
            isDraggingSlider = true;
        });
        slider.addEventListener("pointerup", () => {
            isDraggingSlider = false;
            slider.value = param.value;
            text.value = param.value.toFixed(1);
        });
        slider.addEventListener("input", () => {
            const value = Number.parseFloat(slider.value);
            param.value = value;
        });

        text.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") {
                let newValue = Number.parseFloat(text.value);
                if (Number.isNaN(newValue)) {
                    text.value = param.value;
                    return;
                }

                newValue = Math.min(newValue, param.max);
                newValue = Math.max(newValue, param.min);
                text.value = newValue;
                param.value = newValue;
            }
        });

        uiElements[param.id] = { slider, text };
        pdiv.appendChild(sliderContainer);
    });

    device.parameterChangeEvent.subscribe((param) => {
        if (!uiElements[param.id]) {
            return;
        }

        if (!isDraggingSlider) {
            uiElements[param.id].slider.value = param.value;
        }
        uiElements[param.id].text.value = param.value.toFixed(1);
    });
}

function makeInportForm(device) {
    const idiv = document.getElementById("rnbo-inports");
    const inportSelect = document.getElementById("inport-select");
    const inportText = document.getElementById("inport-text");
    const inportForm = document.getElementById("inport-form");

    if (!idiv || !inportSelect || !inportText || !inportForm) {
        return;
    }

    let inportTag = null;
    const messages = device.messages;
    const inports = messages.filter((message) => message.type === RNBO.MessagePortType.Inport);

    if (inports.length === 0) {
        const noInportsLabel = document.getElementById("no-inports-label");
        if (noInportsLabel && inportForm.parentNode === idiv) {
            idiv.removeChild(inportForm);
        }
        return;
    }

    const noInportsLabel = document.getElementById("no-inports-label");
    if (noInportsLabel) {
        idiv.removeChild(noInportsLabel);
    }

    inports.forEach((inport) => {
        const option = document.createElement("option");
        option.innerText = inport.tag;
        inportSelect.appendChild(option);
    });

    inportSelect.onchange = () => {
        inportTag = inportSelect.value;
    };
    inportTag = inportSelect.value;

    inportForm.onsubmit = (ev) => {
        ev.preventDefault();

        const values = inportText.value.split(/\s+/).map((value) => parseFloat(value));
        const messageEvent = new RNBO.MessageEvent(RNBO.TimeNow, inportTag, values);
        device.scheduleEvent(messageEvent);
    };
}

function attachOutports(device) {
    const consoleRoot = document.getElementById("rnbo-console");
    const consoleDiv = document.getElementById("rnbo-console-div");
    const noOutportsLabel = document.getElementById("no-outports-label");

    if (!consoleRoot || !consoleDiv) {
        return;
    }

    const outports = device.outports;
    if (outports.length < 1) {
        consoleRoot.removeChild(consoleDiv);
        return;
    }

    if (noOutportsLabel) {
        consoleRoot.removeChild(noOutportsLabel);
    }

    device.messageEvent.subscribe((ev) => {
        if (outports.findIndex((elt) => elt.tag === ev.tag) < 0) {
            return;
        }

        console.log(`${ev.tag}: ${ev.payload}`);
        document.getElementById("rnbo-console-readout").innerText = `${ev.tag}: ${ev.payload}`;
    });
}

function loadPresets(device, patcher) {
    const presetsRoot = document.getElementById("rnbo-presets");
    const presetSelect = document.getElementById("preset-select");
    const noPresetsLabel = document.getElementById("no-presets-label");

    if (!presetsRoot || !presetSelect) {
        return;
    }

    const presets = patcher.presets || [];
    if (presets.length < 1) {
        presetsRoot.removeChild(presetSelect);
        return;
    }

    if (noPresetsLabel) {
        presetsRoot.removeChild(noPresetsLabel);
    }

    presets.forEach((preset, index) => {
        const option = document.createElement("option");
        option.innerText = preset.name;
        option.value = index;
        presetSelect.appendChild(option);
    });

    presetSelect.onchange = () => {
        device.setPreset(presets[presetSelect.value].preset);
    };
}

function makeMIDIKeyboard(device) {
    const mdiv = document.getElementById("rnbo-clickable-keyboard");

    if (!mdiv || device.numMIDIInputPorts === 0) {
        return;
    }

    const noMidiLabel = document.getElementById("no-midi-label");
    if (noMidiLabel) {
        mdiv.removeChild(noMidiLabel);
    }

    const midiNotes = [49, 52, 56, 63];
    midiNotes.forEach((note) => {
        const key = document.createElement("div");
        const label = document.createElement("p");
        label.textContent = note;
        key.appendChild(label);

        key.addEventListener("pointerdown", () => {
            const midiChannel = 0;
            const noteOnMessage = [144 + midiChannel, note, 100];
            const noteOffMessage = [128 + midiChannel, note, 0];
            const midiPort = 0;
            const noteDurationMs = 250;
            const currentTime = device.context.currentTime * 1000;

            const noteOnEvent = new RNBO.MIDIEvent(currentTime, midiPort, noteOnMessage);
            const noteOffEvent = new RNBO.MIDIEvent(currentTime + noteDurationMs, midiPort, noteOffMessage);

            device.scheduleEvent(noteOnEvent);
            device.scheduleEvent(noteOffEvent);
            key.classList.add("clicked");
        });

        key.addEventListener("pointerup", () => {
            key.classList.remove("clicked");
        });

        mdiv.appendChild(key);
    });
}

setup().catch((err) => {
    console.error(err);
});
