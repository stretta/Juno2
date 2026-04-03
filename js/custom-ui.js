const PARAM_LABEL_OVERRIDES = {
    FilterMode: "Mode",
    Resonance: "Res",
    FilterOffset: "Cutoff",
    LFORate: "Rate",
    LFOShape: "Shape",
    PitchLFOAmt: "Vib",
    PWLFOAmt: "PWM",
    FilterLFOAmt: "Filter",
    FilterEnvAttack: "A",
    FilterEnvDecay: "D",
    FilterEnvSustain: "S",
    FilterEnvRelease: "R",
    FilterEnvAmt: "Env",
    SawLevel: "Saw",
    PulseLevel: "Pulse",
    SubLevel: "Sub",
    NoiseLevel: "Noise",
    PW: "PW",
    VCAEnvAttack: "A",
    VCAEnvDecay: "D",
    VCAEnvSustain: "S",
    VCAEnvRelease: "R"
};

const CONTROL_GROUPS = [
    {
        title: "LFO",
        controls: ["LFOShape", "LFORate", "PitchLFOAmt", "PWLFOAmt", "FilterLFOAmt"]
    },
    {
        title: "Osc",
        controls: ["SawLevel", "PulseLevel", "PW", "SubLevel", "NoiseLevel"]
    },
    {
        title: "Filter",
        controls: ["FilterMode", "FilterOffset", "Resonance", "FilterEnvAmt"]
    },
    {
        title: "Filter Env",
        controls: ["FilterEnvAttack", "FilterEnvDecay", "FilterEnvSustain", "FilterEnvRelease"]
    },
    {
        title: "VCA Env",
        controls: ["VCAEnvAttack", "VCAEnvDecay", "VCAEnvSustain", "VCAEnvRelease"]
    }
];

let midiAccess = null;
let connectedMidiInput = null;

window.addEventListener("rnbo-ready", (event) => {
    const { device, patcher } = event.detail;

    console.log("RNBO ready", {
        patcher: patcher.desc.meta.filename,
        parameters: device.parameters.map((param) => param.id)
    });

    mountControls(device);
    mountPresetMenu(device, patcher);
    mountWebMIDI(device);
    mountKeyboard(device);
});

function mountControls(device) {
    const container = document.getElementById("rnbo-parameter-sliders");
    if (!container) {
        return;
    }

    container.innerHTML = "";

    const parameterMap = new Map(device.parameters.map((param) => [param.id, param]));

    CONTROL_GROUPS.forEach((group) => {
        const groupElement = createControlGroup(group.title);

        group.controls.forEach((id) => {
            const param = parameterMap.get(id);
            if (!param) {
                return;
            }

            const label = PARAM_LABEL_OVERRIDES[param.id] || param.name;
            const control = isGraphicSelectorParam(param.id)
                ? createGraphicSelector(param, label)
                : createVerticalSlider(param, label);

            groupElement.querySelector(".control-group-grid").appendChild(control);
        });

        const hasControls = groupElement.querySelector(".control-group-grid").children.length > 0;
        if (hasControls) {
            container.appendChild(groupElement);
        }
    });

    const usedParamIds = new Set(CONTROL_GROUPS.flatMap((group) => group.controls));
    const remainingParams = device.parameters.filter((param) => !usedParamIds.has(param.id));
    if (remainingParams.length > 0) {
        const extrasGroup = createControlGroup("More");
        remainingParams.forEach((param) => {
            const label = PARAM_LABEL_OVERRIDES[param.id] || param.name;
            const control = isGraphicSelectorParam(param.id)
                ? createGraphicSelector(param, label)
                : createVerticalSlider(param, label);

            extrasGroup.querySelector(".control-group-grid").appendChild(control);
        });
        container.appendChild(extrasGroup);
    }

    device.parameterChangeEvent.subscribe((param) => {
        const slider = document.querySelector(`[data-param-slider="${param.id}"]`);
        const readout = document.querySelector(`[data-param-readout="${param.id}"]`);
        const graphicOptions = document.querySelectorAll(`[data-param-option="${param.id}"]`);

        if (slider) {
            slider.value = param.value;
        }

        if (graphicOptions.length > 0) {
            const roundedValue = Math.round(Number(param.value));
            graphicOptions.forEach((option) => {
                option.dataset.active = option.dataset.paramValue === String(roundedValue) ? "true" : "false";
            });
        }

        if (readout) {
            readout.textContent = formatValue(param);
        }
    });
}

function createControlGroup(title) {
    const section = document.createElement("section");
    const heading = document.createElement("h2");
    const grid = document.createElement("div");

    section.className = "control-group";
    section.dataset.group = title.toLowerCase().replace(/\s+/g, "-");
    heading.className = "control-group-title";
    heading.textContent = title;
    grid.className = "control-group-grid";

    section.appendChild(heading);
    section.appendChild(grid);

    return section;
}

function createVerticalSlider(param, labelText) {
    const wrapper = document.createElement("section");
    const label = document.createElement("label");
    const slider = document.createElement("input");
    const readout = document.createElement("output");

    wrapper.className = "control-strip";
    if (param.id === "PulseLevel") {
        wrapper.classList.add("pulse-source");
    }
    if (param.id === "PW") {
        wrapper.classList.add("pulse-width");
    }

    label.className = "control-label";
    label.htmlFor = `slider-${param.id}`;
    label.textContent = labelText || param.name;

    slider.className = "vertical-slider";
    slider.id = `slider-${param.id}`;
    slider.type = "range";
    slider.min = param.min;
    slider.max = param.max;
    slider.step = getStep(param);
    slider.value = param.value;
    slider.setAttribute("orient", "vertical");
    slider.dataset.paramSlider = param.id;
    slider.setAttribute("aria-label", param.name);

    readout.className = "control-readout";
    readout.dataset.paramReadout = param.id;
    readout.textContent = formatValue(param);

    slider.addEventListener("input", () => {
        param.value = Number.parseFloat(slider.value);
        readout.textContent = formatValue(param);
    });

    wrapper.appendChild(label);
    wrapper.appendChild(slider);
    wrapper.appendChild(readout);

    return wrapper;
}

function createGraphicSelector(param, labelText) {
    const wrapper = document.createElement("section");
    const label = document.createElement("label");
    const options = document.createElement("div");
    const readout = document.createElement("output");
    const waveformNames = getEnumNames(param);
    const steps = Number(param.steps) || waveformNames.length || 0;
    const valueStep = steps > 1 ? (param.max - param.min) / (steps - 1) : 1;

    wrapper.className = "control-strip graphic-selector";
    label.className = "control-label";
    label.textContent = labelText || param.name;

    options.className = "graphic-options";
    options.setAttribute("role", "radiogroup");
    options.setAttribute("aria-label", param.name);

    waveformNames.forEach((name, index) => {
        const button = document.createElement("button");
        const optionValue = Math.round(param.min + (valueStep * index));

        button.type = "button";
        button.className = "graphic-option";
        button.dataset.paramOption = param.id;
        button.dataset.paramValue = String(optionValue);
        button.dataset.kind = getGraphicSelectorKind(param.id);
        button.dataset.valueName = name;
        button.dataset.active = optionValue === Math.round(Number(param.value)) ? "true" : "false";
        button.setAttribute("aria-label", `${param.name} ${name}`);
        button.appendChild(createGraphicIcon(param.id, name));

        button.addEventListener("click", () => {
            param.value = optionValue;
            readout.textContent = formatValue(param);
            syncGraphicOptions(param.id, optionValue);
        });

        options.appendChild(button);
    });

    readout.className = "control-readout";
    readout.dataset.paramReadout = param.id;
    readout.textContent = formatValue(param);

    wrapper.appendChild(label);
    wrapper.appendChild(options);
    wrapper.appendChild(readout);

    return wrapper;
}

function getEnumNames(param) {
    if (Array.isArray(param.enumValues) && param.enumValues.length > 0) {
        return param.enumValues;
    }

    return ["sine", "square", "tri", "ramp"];
}

function isGraphicSelectorParam(paramId) {
    return paramId === "LFOShape" || paramId === "FilterMode";
}

function getGraphicSelectorKind(paramId) {
    return paramId === "FilterMode" ? "filter" : "waveform";
}

function createGraphicIcon(paramId, name) {
    const namespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(namespace, "svg");
    const path = document.createElementNS(namespace, "path");

    svg.setAttribute("viewBox", "0 0 64 36");
    svg.setAttribute("class", "graphic-icon");
    svg.setAttribute("aria-hidden", "true");

    path.setAttribute("class", "graphic-trace");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("d", getGraphicPath(paramId, name));

    svg.appendChild(path);

    return svg;
}

function getGraphicPath(paramId, name) {
    if (paramId === "FilterMode") {
        return getFilterModePath(name);
    }

    return getWaveformPath(name);
}

function getWaveformPath(name) {
    switch (name.toLowerCase()) {
        case "sine":
            return "M 4 18 C 10 6, 18 6, 24 18 S 38 30, 44 18 S 58 6, 60 18";
        case "square":
            return "M 4 26 L 4 10 L 20 10 L 20 26 L 44 26 L 44 10 L 60 10";
        case "tri":
        case "triangle":
            return "M 4 18 L 18 6 L 32 30 L 46 6 L 60 18";
        case "ramp":
        case "saw":
            return "M 4 30 L 24 6 L 24 30 L 44 6 L 44 30 L 60 12";
        default:
            return "M 4 18 L 60 18";
    }
}

function getFilterModePath(name) {
    switch (name.toLowerCase()) {
        case "lpf":
        case "lowpass":
            return "M 4 10 L 22 10 C 30 10, 36 11, 40 13 C 46 17, 50 23, 60 28";
        case "bpf":
        case "bandpass":
            return "M 4 28 C 14 28, 18 28, 22 26 C 28 22, 30 12, 32 8 C 34 12, 36 22, 42 26 C 46 28, 50 28, 60 28";
        case "hpf":
        case "highpass":
            return "M 4 28 C 16 28, 22 27, 28 24 C 36 20, 42 16, 60 10";
        case "notch":
            return "M 4 10 L 22 10 C 27 10, 29 14, 32 26 C 35 14, 37 10, 42 10 L 60 10";
        default:
            return "M 4 18 L 60 18";
    }
}

function syncGraphicOptions(paramId, activeValue) {
    const graphicOptions = document.querySelectorAll(`[data-param-option="${paramId}"]`);
    graphicOptions.forEach((option) => {
        option.dataset.active = option.dataset.paramValue === String(activeValue) ? "true" : "false";
    });
}

function getStep(param) {
    if (param.steps > 1) {
        return (param.max - param.min) / (param.steps - 1);
    }

    return (param.max - param.min) / 1000;
}

function formatValue(param) {
    const value = Number(param.value);
    if (Array.isArray(param.enumValues) && param.enumValues.length > 0) {
        const steps = Number(param.steps) || param.enumValues.length;
        const index = steps > 1
            ? Math.round((value - param.min) / ((param.max - param.min) / (steps - 1)))
            : 0;
        const enumValue = param.enumValues[Math.max(0, Math.min(param.enumValues.length - 1, index))];
        return enumValue || `${value}`;
    }

    if (param.steps === 2) {
        return `${Math.round(value)}`;
    }

    const formatted = value.toFixed(2).replace(/\.00$/, "");
    return param.unit ? `${formatted} ${param.unit}` : formatted;
}

function mountPresetMenu(device, patcher) {
    const presetPanel = document.getElementById("preset-panel");
    const presetSelect = document.getElementById("preset-select");

    if (!presetPanel || !presetSelect) {
        return;
    }

    const presets = patcher.presets || [];
    presetSelect.innerHTML = "";

    if (presets.length < 1) {
        presetPanel.hidden = true;
        return;
    }

    presets.forEach((preset, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = preset.name || `Preset ${index + 1}`;
        presetSelect.appendChild(option);
    });

    presetSelect.addEventListener("change", () => {
        const selectedPreset = presets[Number(presetSelect.value)];
        if (selectedPreset) {
            device.setPreset(selectedPreset.preset);
        }
    });

    presetSelect.value = "0";
    device.setPreset(presets[0].preset);
    presetPanel.hidden = false;
}

async function mountWebMIDI(device) {
    const midiPanel = document.getElementById("midi-panel");
    const midiInputSelect = document.getElementById("midi-input-select");

    if (!midiPanel || !midiInputSelect || device.numMIDIInputPorts < 1) {
        return;
    }

    if (!navigator.requestMIDIAccess) {
        midiPanel.hidden = true;
        return;
    }

    try {
        midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    } catch (err) {
        console.warn("Web MIDI unavailable", err);
        midiPanel.hidden = true;
        return;
    }

    const refreshMidiInputs = () => {
        const inputs = Array.from(midiAccess.inputs.values());
        midiInputSelect.innerHTML = "";

        if (inputs.length < 1) {
            disconnectMidiInput();
            midiPanel.hidden = true;
            return;
        }

        inputs.forEach((input) => {
            const option = document.createElement("option");
            option.value = input.id;
            option.textContent = input.name || input.manufacturer || input.id;
            midiInputSelect.appendChild(option);
        });

        const defaultInputId = connectedMidiInput && inputs.some((input) => input.id === connectedMidiInput.id)
            ? connectedMidiInput.id
            : inputs[0].id;

        midiInputSelect.value = defaultInputId;
        connectMidiInput(device, midiAccess.inputs.get(defaultInputId));
        midiPanel.hidden = false;
    };

    midiInputSelect.onchange = () => {
        connectMidiInput(device, midiAccess.inputs.get(midiInputSelect.value));
    };

    midiAccess.onstatechange = refreshMidiInputs;
    refreshMidiInputs();
}

function connectMidiInput(device, input) {
    if (!input) {
        disconnectMidiInput();
        return;
    }

    if (connectedMidiInput && connectedMidiInput.id === input.id) {
        return;
    }

    disconnectMidiInput();
    connectedMidiInput = input;
    connectedMidiInput.onmidimessage = (event) => {
        if (!event.data || event.data.length < 1) {
            return;
        }

        const payload = Array.from(event.data);
        const midiEvent = new RNBO.MIDIEvent(device.context.currentTime * 1000, 0, payload);
        device.scheduleEvent(midiEvent);
    };
}

function disconnectMidiInput() {
    if (!connectedMidiInput) {
        return;
    }

    connectedMidiInput.onmidimessage = null;
    connectedMidiInput = null;
}

function mountKeyboard(device) {
    const container = document.getElementById("rnbo-keyboard");
    if (!container) {
        return;
    }

    if (device.numMIDIInputPorts < 1) {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = "";

    const keyboard = document.createElement("div");
    keyboard.className = "keyboard";

    const whiteKeyWidth = 100 / 35;
    const blackKeyWidth = whiteKeyWidth * 0.62;
    const blackKeyOffset = blackKeyWidth / 2;
    const whitePitchClasses = new Set([0, 2, 4, 5, 7, 9, 11]);
    const whiteKeys = [];
    const keyElements = new Map();
    const startNote = 36;
    const totalNotes = 60;
    const keyboardState = {
        activeNote: null,
        activePointerId: null
    };

    for (let note = startNote; note < startNote + totalNotes; note += 1) {
        const pitchClass = note % 12;
        const isWhite = whitePitchClasses.has(pitchClass);
        const key = document.createElement("button");

        key.type = "button";
        key.className = isWhite ? "piano-key white-key" : "piano-key black-key";
        key.dataset.note = String(note);
        key.setAttribute("aria-label", noteName(note));

        if (isWhite) {
            key.style.left = `${whiteKeys.length * whiteKeyWidth}%`;
            key.style.width = `${whiteKeyWidth}%`;
            whiteKeys.push(note);
        } else {
            const previousWhiteIndex = whiteKeys.length - 1;
            key.style.left = `${(previousWhiteIndex + 1) * whiteKeyWidth - blackKeyOffset}%`;
            key.style.width = `${blackKeyWidth}%`;
        }

        key.addEventListener("pointerdown", (event) => {
            event.preventDefault();
            key.setPointerCapture(event.pointerId);
            keyboardState.activePointerId = event.pointerId;
            playKeyboardNote(device, keyboardState, keyElements, note);
        });

        key.addEventListener("pointerenter", (event) => {
            if (event.buttons === 1 && keyboardState.activePointerId === event.pointerId) {
                playKeyboardNote(device, keyboardState, keyElements, note);
            }
        });

        key.addEventListener("pointerup", (event) => {
            if (keyboardState.activePointerId === event.pointerId) {
                stopKeyboardNote(device, keyboardState, keyElements);
                keyboardState.activePointerId = null;
            }
        });

        key.addEventListener("pointercancel", (event) => {
            if (keyboardState.activePointerId === event.pointerId) {
                stopKeyboardNote(device, keyboardState, keyElements);
                keyboardState.activePointerId = null;
            }
        });

        keyboard.appendChild(key);
        keyElements.set(note, key);
    }

    container.appendChild(keyboard);

    window.addEventListener("pointerup", (event) => {
        if (keyboardState.activePointerId === event.pointerId) {
            stopKeyboardNote(device, keyboardState, keyElements);
            keyboardState.activePointerId = null;
        }
    });

    window.addEventListener("pointercancel", (event) => {
        if (keyboardState.activePointerId === event.pointerId) {
            stopKeyboardNote(device, keyboardState, keyElements);
            keyboardState.activePointerId = null;
        }
    });
}

function playKeyboardNote(device, keyboardState, keyElements, note) {
    if (keyboardState.activeNote === note) {
        return;
    }

    if (keyboardState.activeNote !== null) {
        sendMIDINote(device, keyboardState.activeNote, 0);
    }

    sendMIDINote(device, note, 100);
    keyboardState.activeNote = note;
    updateActiveKey(keyElements, note);
}

function updateActiveKey(keyElements, activeNote) {
    keyElements.forEach((element, note) => {
        element.classList.toggle("active", note === activeNote);
    });
}

function stopKeyboardNote(device, keyboardState, keyElements) {
    if (keyboardState.activeNote === null) {
        return;
    }

    sendMIDINote(device, keyboardState.activeNote, 0);
    keyboardState.activeNote = null;
    updateActiveKey(keyElements, null);
}

function sendMIDINote(device, note, velocity) {
    const midiPort = 0;
    const midiChannel = 0;
    const status = velocity > 0 ? 144 + midiChannel : 128 + midiChannel;
    const payload = [status, note, velocity];
    const eventTime = device.context.currentTime * 1000;
    const midiEvent = new RNBO.MIDIEvent(eventTime, midiPort, payload);

    device.scheduleEvent(midiEvent);
}

function noteName(note) {
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const octave = Math.floor(note / 12) - 1;
    return `${names[note % 12]}${octave}`;
}
