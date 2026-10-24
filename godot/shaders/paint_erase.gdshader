// The Shipwright's eraser (src/ui/flag_stage.gd): whatever it covers of the
// brush's layer taken away, as the web's destination-out takes it. The
// layer's colour is premultiplied, so colour and alpha both keep what's left.
shader_type canvas_item;
render_mode blend_mul, unshaded;

void fragment() {
	float left = 1.0 - COLOR.a;
	COLOR = vec4(left, left, left, left);
}
