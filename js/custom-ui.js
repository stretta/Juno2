const PARAM_LABEL_OVERRIDES = {
    FilterOffset: "Filter Offset",
    FilterLFORate: "LFO Rate",
    FilterLFOAmt: "LFO Amount",
    FilterEnvAttack: "F Env Attack",
    FilterEnvDecay: "F Env Decay",
    FilterEnvSustain: "F Env Sustain",
    FilterEnvAttackRelease: "F Env Release",
    FilterEnvAmt: "F Env Amount",
    SawLevel: "Saw",
    PulseLevel: "Pulse",
    SubLevel: "Sub",
    NoiseLevel: "Noise",
    PW: "Pulse Width",
    attack: "Attack",
    decay: "Decay",
    sustain: "Sustain",
    release: "Release"
};

const CONTROL_GROUPS = [
    {
        title: "Osc",
        controls: ["SawLevel", "PulseLevel", "PW", "SubLevel", "NoiseLevel"]
    },
    {
        title: "Filter",
        controls: ["FilterOffset", "Resonance", "FilterLFORate", "FilterLFOAmt", "FilterEnvAmt"]
    },
    {
        title: "Filter Env",
        controls: ["FilterEnvAttack", "FilterEnvDecay", "FilterEnvSustain", "FilterEnvAttackRelease"]
    },
    {
        title: "VCA Env",
        controls: ["attack", "decay", "sustain", "release"]
    }
];

window.addEventListener("rnbo-ready", (event) => {
    const { device, patcher } = event.detail;

    console.log("RNBO ready", {
        patcher: patcher.desc.meta.filename,
        parameters: device.parameters.map((param) => param.id)
    });

    mountControls(device);
    mountPresetMenu(device, patcher);
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
            groupElement.querySelector(".control-group-grid").appendChild(createVerticalSlider(param, label));
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
            extrasGroup.querySelector(".control-group-grid").appendChild(createVerticalSlider(param, label));
        });
        container.appendChild(extrasGroup);
    }

    device.parameterChangeEvent.subscribe((param) => {
        const slider = document.querySelector(`[data-param-slider="${param.id}"]`);
        const readout = document.querySelector(`[data-param-readout="${param.id}"]`);

        if (slider) {
            slider.value = param.value;
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

function getStep(param) {
    if (param.steps > 1) {
        return (param.max - param.min) / (param.steps - 1);
    }

    return (param.max - param.min) / 1000;
}

function formatValue(param) {
    const value = Number(param.value);
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

    presetPanel.hidden = false;
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
