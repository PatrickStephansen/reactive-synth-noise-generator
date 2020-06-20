const bytesPerMemorySlot = 32 / 8;

registerProcessor(
	"reactive-synth-noise-generator",
	class NoiseGenerator extends AudioWorkletProcessor {
		static get parameterDescriptors() {
			return [
				{
					name: "stepMax",
					defaultValue: 1,
					minValue: 0,
					maxValue: 1,
					automationRate: "a-rate"
				},
				{
					name: "stepMin",
					defaultValue: 0,
					minValue: 0,
					maxValue: 1,
					automationRate: "a-rate"
				},
				{
					name: "sampleHold",
					defaultValue: 1,
					minValue: 0,
					maxValue: 1000000,
					automationRate: "a-rate"
				},
				{
					name: "nextValueTrigger",
					defaultValue: 0,
					automationRate: "a-rate"
				}
			];
		}
		constructor() {
			super();
			this.port.onmessage = this.handleMessage.bind(this);
			this.triggerChangeMessage = { type: "trigger-change", value: false };
			this.manualTriggerOn = false;
		}

		handleMessage(event) {
			if (event.data && event.data.type === "manual-trigger") {
				this.manualTriggerOn = event.data.value;
			}
			if (event.data && event.data.type === "wasm") {
				this.initWasmModule(event.data.wasmBinary);
			}
		}

		async initWasmModule(binary) {
			console.log('compiling noise generator')
			const compiledModule = await WebAssembly.compile(binary);
			console.log('compiled noise generator');
			this.wasmModule = await WebAssembly.instantiate(compiledModule, {
				trigger: {
					change: b => {
						this.triggerChangeMessage.value = b;
						this.port.postMessage(this.triggerChangeMessage);
					}
				}
			});
			this.internalProcessorPtr = this.wasmModule.exports.init(128);
			this.float32WasmMemory = new Float32Array(
				this.wasmModule.exports.memory.buffer
			);
		}

		process(_inputs, outputs, parameters) {
			if (this.wasmModule) {
				this.float32WasmMemory.set(
					parameters.stepMin,
					this.wasmModule.exports.get_step_min_ptr(this.internalProcessorPtr) /
						bytesPerMemorySlot
				);
				this.float32WasmMemory.set(
					parameters.stepMax,
					this.wasmModule.exports.get_step_max_ptr(this.internalProcessorPtr) /
						bytesPerMemorySlot
				);
				this.float32WasmMemory.set(
					parameters.sampleHold,
					this.wasmModule.exports.get_sample_hold_ptr(
						this.internalProcessorPtr
					) / bytesPerMemorySlot
				);
				this.float32WasmMemory.set(
					this.manualTriggerOn ? [1] : parameters.nextValueTrigger,
					this.wasmModule.exports.get_sample_hold_ptr(
						this.internalProcessorPtr
					) / bytesPerMemorySlot
				);
				const outputPointer =
					this.wasmModule.exports.process_quantum(
						parameters.minStep.length,
						parameters.maxStep.length,
						parameters.sampleHold.length,
						this.manualTriggerOn ? 1 : parameters.nextValueTrigger.length
					) / bytesPerMemorySlot;
				for (
					let channelIndex = 0;
					channelIndex < outputs[0].length;
					channelIndex++
				) {
					for (
						let sampleIndex = 0;
						sampleIndex < outputs[0][channelIndex].length;
						sampleIndex++
					) {
						outputs[0][channelIndex][sampleIndex] = this.float32WasmMemory[
							outputPointer + sample
						];
					}
				}
			}
			return true;
		}
	}
);
