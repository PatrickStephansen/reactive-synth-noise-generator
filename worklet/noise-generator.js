const bytesPerMemorySlot = 32 / 8;

const trace = name => arg => console.log(name, arg);

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
			const compiledModule = await WebAssembly.compile(binary);
			this.wasmModule = await WebAssembly.instantiate(compiledModule, {
				imports: {
					change: b => {
						this.triggerChangeMessage.value = b;
						this.port.postMessage(this.triggerChangeMessage);
					},
					random: Math.random
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
					this.wasmModule.exports.get_step_minimum_ptr(
						this.internalProcessorPtr
					) / bytesPerMemorySlot
				);
				this.float32WasmMemory.set(
					parameters.stepMax,
					this.wasmModule.exports.get_step_maximum_ptr(
						this.internalProcessorPtr
					) / bytesPerMemorySlot
				);
				this.float32WasmMemory.set(
					parameters.sampleHold,
					this.wasmModule.exports.get_sample_hold_ptr(
						this.internalProcessorPtr
					) / bytesPerMemorySlot
				);
				this.float32WasmMemory.set(
					this.manualTriggerOn ? [1] : parameters.nextValueTrigger,
					this.wasmModule.exports.get_next_value_trigger_ptr(
						this.internalProcessorPtr
					) / bytesPerMemorySlot
				);
				const outputPointer =
					this.wasmModule.exports.process_quantum(
						this.internalProcessorPtr,
						parameters.stepMin.length,
						parameters.stepMax.length,
						parameters.sampleHold.length,
						this.manualTriggerOn ? 1 : parameters.nextValueTrigger.length
					) / bytesPerMemorySlot;
				for (
					let channelIndex = 0;
					channelIndex < outputs[0].length;
					channelIndex++
				) {
					for (
						let sample = 0;
						sample < outputs[0][channelIndex].length;
						sample++
					) {
						outputs[0][channelIndex][sample] = this.float32WasmMemory[
							outputPointer + sample
						];
					}
				}
			}
			return true;
		}
	}
);
