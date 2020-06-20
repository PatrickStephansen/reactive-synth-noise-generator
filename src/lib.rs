// When the `wee_alloc` feature is enabled, use `wee_alloc` as the global
// allocator.
#[cfg(feature = "wee_alloc")]
#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

use rand::rngs::SmallRng;
use rand::{Rng, SeedableRng};

// rust has a built-in for this but behind a feature flag
// use the native one if they get their shit together
fn clamp(min_value: f32, max_value: f32, value: f32) -> f32 {
	if value < min_value {
		return min_value;
	} else {
		if value > max_value {
			return max_value;
		} else {
			return value;
		}
	};
}

fn get_parameter(param: &Vec<f32>, min_value: f32, max_value: f32, index: usize) -> f32 {
	if param.len() > 1 {
		clamp(min_value, max_value, param[index])
	} else {
		if param.len() == 0 {
			clamp(min_value, max_value, 0.0)
		} else {
			clamp(min_value, max_value, param[0])
		}
	}
}

fn generate_next_value<R: Rng>(
	rng: &mut R,
	previous_value: f32,
	step_minimum: f32,
	step_maximum: f32,
) -> f32 {
	let step_size: f32;
	if step_minimum < step_maximum {
		step_size = rng.gen_range(step_minimum, step_maximum);
	} else {
		step_size = rng.gen_range(step_maximum, step_minimum)
	}
	let prefer_up = rng.gen::<f32>() > 0.5;
	if prefer_up {
		if previous_value + step_size > 1.0 {
			previous_value - step_size
		} else {
			previous_value + step_size
		}
	} else {
		if previous_value - step_size < -1.0 {
			previous_value + step_size
		} else {
			previous_value - step_size
		}
	}
}

pub struct NoiseGenerator {
	step_minimum: Vec<f32>,
	step_maximum: Vec<f32>,
	sample_hold: Vec<f32>,
	next_value_trigger: Vec<f32>,
	render_quantum_samples: usize,
	output: Vec<f32>,
	samples_held: f32,
	previous_sample: f32,
	is_trigger_high: bool,
}

impl NoiseGenerator {
	pub fn new(render_quantum_samples: usize) -> NoiseGenerator {
		let mut output = Vec::with_capacity(render_quantum_samples);
		output.resize(render_quantum_samples, 0.0);
		NoiseGenerator {
			step_minimum: Vec::with_capacity(render_quantum_samples),
			step_maximum: Vec::with_capacity(render_quantum_samples),
			sample_hold: Vec::with_capacity(render_quantum_samples),
			next_value_trigger: Vec::with_capacity(render_quantum_samples),
			render_quantum_samples,
			output,
			samples_held: 0.0,
			previous_sample: 0.1,
			is_trigger_high: false,
		}
	}

	pub fn process(&mut self, trigger_changed: unsafe fn(bool)) {
		for sample_index in 0..self.render_quantum_samples {
			// recover from overflow
			if self.samples_held < 0.0 {
				self.samples_held = 0.0;
			}
			let sample_hold = get_parameter(&self.sample_hold, 0.0, 1e9, sample_index);
			// keep playing previous sample forever if sampleHold < 1
			if sample_hold >= 1.0 && self.samples_held >= sample_hold {
				self.samples_held -= sample_hold;
				self.previous_sample = generate_next_value(
					&mut rand::thread_rng(),
					self.previous_sample,
					get_parameter(&self.step_minimum, 0.0, 1.0, sample_index),
					get_parameter(&self.step_maximum, 0.0, 1.0, sample_index),
				);
			}
			let trigger_value = get_parameter(&self.next_value_trigger, 0.0, 1.0, sample_index);
			if self.is_trigger_high != (trigger_value > 0.0) {
				unsafe {
					trigger_changed(trigger_value > 0.0);
					log(30)
				}
				if trigger_value > 0.0 {
					self.previous_sample = generate_next_value(
						&mut rand::thread_rng(),
						self.previous_sample,
						get_parameter(&self.step_minimum, 0.0, 1.0, sample_index),
						get_parameter(&self.step_maximum, 0.0, 1.0, sample_index),
					);
				}
			}
			self.output[sample_index] = self.previous_sample;
			self.is_trigger_high = trigger_value > 0.0;
			self.samples_held += 1.0;
		}
	}

	pub fn get_output(&self) -> *const f32 {
		self.output.as_ptr()
	}
}

#[no_mangle]
pub unsafe extern "C" fn init(render_quantum_samples: i32) -> *mut NoiseGenerator {
	Box::into_raw(Box::new(NoiseGenerator::new(
		render_quantum_samples as usize,
	)))
}

#[link(wasm_import_module = "trigger")]
extern "C" {
	fn change(active: bool);
	fn log(point: i32);
}

unsafe fn signal_trigger_change(active: bool) {
	change(active);
}

#[no_mangle]
pub unsafe extern "C" fn process_quantum(
	me: *mut NoiseGenerator,
	step_minimum_length: i32,
	step_maximum_length: i32,
	sample_hold_length: i32,
	next_value_trigger_length: i32,
) -> *const f32 {
	(*me).step_minimum.set_len(step_minimum_length as usize);
	(*me).step_maximum.set_len(step_maximum_length as usize);
	(*me).sample_hold.set_len(sample_hold_length as usize);
	(*me)
		.next_value_trigger
		.set_len(next_value_trigger_length as usize);
	(*me).process(signal_trigger_change);
	(*me).get_output()
}

#[no_mangle]
pub unsafe extern "C" fn get_step_minimum_ptr(me: *mut NoiseGenerator) -> *mut f32 {
	(*me).step_minimum.as_mut_ptr()
}
#[no_mangle]
pub unsafe extern "C" fn get_step_maximum_ptr(me: *mut NoiseGenerator) -> *mut f32 {
	(*me).step_maximum.as_mut_ptr()
}
#[no_mangle]
pub unsafe extern "C" fn get_sample_hold_ptr(me: *mut NoiseGenerator) -> *mut f32 {
	(*me).sample_hold.as_mut_ptr()
}
#[no_mangle]
pub unsafe extern "C" fn get_next_value_trigger_ptr(me: *mut NoiseGenerator) -> *mut f32 {
	(*me).next_value_trigger.as_mut_ptr()
}
