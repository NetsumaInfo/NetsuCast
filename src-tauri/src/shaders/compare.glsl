// NetsuCast before/after comparison. SPDX-License-Identifier: AGPL-3.0-only
//
// Listed BEFORE the ArtCNN shaders: the first pass keeps the source luma, ArtCNN then runs as
// usual from its own files, and the second pass, at the NATIVE stage (after every LUMA hook),
// draws the source left of the line. A shader cannot read a texture saved by another file, and
// a shader parameter makes libplacebo recompile every other user shader (23 s per ArtCNN pass
// on NVIDIA), so the line position is written into this file: compare.rs fills in the constant.

//!DESC NetsuCast compare (keep source)
//!HOOK LUMA
//!BIND HOOKED
//!SAVE NC_SOURCE
//!COMPONENTS 1

vec4 hook() {
    return HOOKED_texOff(0);
}

//!DESC NetsuCast compare (split)
//!HOOK NATIVE
//!BIND HOOKED
//!BIND NC_SOURCE

vec4 hook() {
    vec4 color = HOOKED_texOff(0);
    if (HOOKED_pos.x >= NC_SPLIT)
        return color;
    // Left of the line: the source luma enlarged with Catmull-Rom, close to what mpv shows
    // without ArtCNN, so the difference on screen is the model's. Chroma is the same both sides.
    vec2 p = HOOKED_pos * NC_SOURCE_size - 0.5;
    vec2 f = fract(p);
    vec2 base = (floor(p) + 0.5) * NC_SOURCE_pt;
    vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
    vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
    vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
    vec2 w3 = f * f * (-0.5 + 0.5 * f);
    float wx[4] = float[4](w0.x, w1.x, w2.x, w3.x);
    float wy[4] = float[4](w0.y, w1.y, w2.y, w3.y);
    float luma = 0.0;
    for (int j = 0; j < 4; j++)
        for (int i = 0; i < 4; i++)
            luma += wx[i] * wy[j] * NC_SOURCE_tex(base + vec2(i - 1, j - 1) * NC_SOURCE_pt).x;
    color.x = clamp(luma, 0.0, 1.0);
    return color;
}
