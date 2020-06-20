# reactive-synth-noise-generator

WASM implementation of a noise generator audio processing node compatible with the web audio API. Created for [reactive-synth](https://github.com/PatrickStephansen/reactive-synth), but usable elsewhere if I ever document how.

The noise generator is an AudioWorkletProcessor that generates each sample value within a limited range of the previous sample so the frequency can be biased towards lower or higher sounds. It also has the ability to hold the same sample value either for a parameterized number of samples, or until the trigger parameter rises above 0. The trigger allows sample accurate timing of value changes which is useful for generative music. 

## build

build command:

```bash
cargo build --features "wee_alloc" --release --target=wasm32-unknown-unknown && \
wasm-opt -Oz --strip-debug -o worklet/reactive_synth_noise_generator.wasm \
target/wasm32-unknown-unknown/release/reactive_synth_noise_generator.wasm
```
Inspect size with:

```bash
twiggy top -n 20 target/wasm32-unknown-unknown/release/reactive_synth_noise_generator_opt.wasm
```

Run `npm link` from the worklet directory before trying to build the reactive-synth app (the dependent app not in this repo)

## test

`cargo test`