"""The Hollow Jack's own sounds (the Hallowtide event ship), synthesised here
rather than baked from the web game's code like the rest:

    cd godot && python3 tools/audio/hallow_sfx.py

writes audio/sfx/phantom_0.wav (crossing into the spirit world: a breath
drawn backwards, a sinking choir of ghosts), wail_0.wav (the Banshee's Wail
as she comes back: a boom, then a keening voice rising and falling away) and
toll_0.wav (a cracked, drowned bell: the power is hers again), 16-bit mono
at 22.05 kHz, peak-normalised, and puts them in audio/sounds.json with the
levels they're played at. Needs numpy; seeded, so a rerun writes the same.
"""
import json
import os
import wave

import numpy as np

SR = 22050
HERE = os.path.dirname(os.path.abspath(__file__))
AUDIO = os.path.join(HERE, '..', '..', 'audio')
rng = np.random.default_rng(31)


def t_of(seconds):
    return np.arange(int(SR * seconds)) / SR


def env(t, attack, release, total):
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    r = np.clip((total - t) / max(release, 1e-4), 0, 1)
    return a * r


def lowpass(x, hz):
    # one-pole, run twice
    k = np.exp(-2 * np.pi * hz / SR)
    for _ in range(2):
        y = np.empty_like(x)
        acc = 0.0
        for i, v in enumerate(x):
            acc = (1 - k) * v + k * acc
            y[i] = acc
        x = y
    return x


def bandpass(x, hz, q):
    # a biquad band-pass (RBJ), hz may be an array (swept)
    hz = np.broadcast_to(np.asarray(hz, dtype=float), x.shape)
    y = np.zeros_like(x)
    x1 = x2 = y1 = y2 = 0.0
    for i in range(len(x)):
        w0 = 2 * np.pi * hz[i] / SR
        alpha = np.sin(w0) / (2 * q)
        b0, b2 = alpha, -alpha
        a0, a1, a2 = 1 + alpha, -2 * np.cos(w0), 1 - alpha
        v = (b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2) / a0
        x2, x1 = x1, x[i]
        y2, y1 = y1, v
        y[i] = v
    return y


def osc(freq, t, shape='sine'):
    ph = 2 * np.pi * np.cumsum(np.broadcast_to(freq, t.shape)) / SR
    if shape == 'saw':
        return 2 * ((ph / (2 * np.pi)) % 1.0) - 1
    return np.sin(ph)


def echo(x, delay, fb, mix):
    d = int(SR * delay)
    y = np.concatenate([x, np.zeros(d * 6)])
    for i in range(d, len(y)):
        y[i] += y[i - d] * fb
    out = np.concatenate([x, np.zeros(d * 6)]) * (1 - mix) + y * mix
    return out


def phantom():
    T = 2.4
    t = t_of(T)
    # a breath drawn in backwards: noise swelling to a sudden stop, swept up
    n = rng.standard_normal(len(t))
    swell = (t / 0.9) ** 3 * (t < 0.9) + np.exp(-(t - 0.9) * 9) * (t >= 0.9)
    breath = bandpass(n, 300 + 2400 * np.clip(t / 0.9, 0, 1) ** 2, 1.4) * swell * 0.9
    # the choir: a minor chord of hollow voices sinking a fifth, each wavering
    voices = np.zeros_like(t)
    for f0, ph in [(220.0, 0.0), (261.6, 1.3), (329.6, 2.1), (110.0, 0.7)]:
        glide = f0 * (1.0 - 0.33 * np.clip((t - 0.7) / 1.6, 0, 1))
        vib = 1 + 0.012 * np.sin(2 * np.pi * (5.2 + ph) * t + ph)
        v = osc(glide * vib, t) + 0.3 * osc(glide * vib * 2.003, t) + 0.12 * osc(glide * vib * 3.01, t)
        voices += v
    voices *= env(t - 0.55, 0.25, 1.1, T - 0.55) * (t > 0.55) * 0.22
    # a cold shimmer on top
    shimmer = bandpass(rng.standard_normal(len(t)), 5200, 3.0) * env(t - 0.8, 0.1, 1.2, T - 0.8) * (t > 0.8) * 0.5
    return echo(breath + voices + shimmer, 0.17, 0.35, 0.35)


def wail():
    T = 2.8
    t = t_of(T)
    # the boom as the spirit world lets her go
    boom = osc(55 * np.exp(-t * 1.4) + 30, t) * np.exp(-t * 3.2) * 1.2
    thump = lowpass(rng.standard_normal(len(t)), 260) * np.exp(-t * 7) * 2.0
    # the keening: a voice rising to a scream and falling away
    p = np.clip((t - 0.12) / (T - 0.3), 0, 1)
    pitch = 420 + 620 * np.sin(np.pi * np.minimum(p * 1.5, 1.0)) ** 1.5 * (1 - 0.6 * np.clip(p * 1.5 - 1, 0, 1)) + 25 * np.sin(2 * np.pi * 6.5 * t)
    src = osc(pitch, t, 'saw') + 0.4 * osc(pitch * 1.006, t, 'saw')
    vowel = np.clip(p * 2.2, 0, 1)
    voice = bandpass(src, 500 + 1800 * vowel, 5.0) + 0.6 * bandpass(src, 1100 + 1600 * vowel, 6.0) + 0.3 * bandpass(src, 2900, 7.0)
    voice *= env(t - 0.12, 0.35, 0.9, T - 0.12) * (t > 0.12) * 1.1
    air = bandpass(rng.standard_normal(len(t)), pitch * 2.2, 2.0) * env(t - 0.12, 0.3, 1.2, T - 0.12) * (t > 0.12) * 0.25
    return echo(boom + thump + voice + air, 0.23, 0.4, 0.4)


def toll():
    T = 2.6
    t = t_of(T)
    # a drowned bell: inharmonic partials, the hum longest, a little out of true
    x = np.zeros_like(t)
    for ratio, amp, decay in [(0.5, 0.6, 1.0), (1.0, 1.0, 1.8), (1.19, 0.5, 2.6), (1.5, 0.35, 3.2), (2.0, 0.3, 4.0), (2.74, 0.22, 5.5), (3.76, 0.12, 7.0)]:
        f = 196.0 * ratio * (1 + 0.004 * np.sin(2 * np.pi * 0.7 * t))
        x += amp * osc(f, t) * np.exp(-t * decay)
    strike = bandpass(rng.standard_normal(len(t)), 2400, 1.5) * np.exp(-t * 40) * 0.6
    x = (x + strike) * env(t, 0.003, 0.4, T)
    return echo(x, 0.29, 0.3, 0.3)


def write(key, x, level):
    x = x / max(np.max(np.abs(x)), 1e-6)
    # the echo's silent tail cut off, with a short fade
    loud = np.nonzero(np.abs(x) > 0.004)[0]
    x = x[:loud[-1] + 1]
    x[-256:] *= np.linspace(1, 0, 256)
    pcm = (x * 32000).astype(np.int16)
    path = os.path.join(AUDIO, 'sfx', '%s_0.wav' % key)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print('%-8s %.2f s  %s' % (key, len(x) / SR, path))
    return {'ext': 'wav', 'gain': [level]}


def main():
    man_path = os.path.join(AUDIO, 'sounds.json')
    with open(man_path) as f:
        man = json.load(f)
    man['sfx']['phantom'] = write('phantom', phantom(), 0.5)
    man['sfx']['wail'] = write('wail', wail(), 0.6)
    man['sfx']['toll'] = write('toll', toll(), 0.32)
    man['sfx'] = dict(sorted(man['sfx'].items()))
    with open(man_path, 'w') as f:
        f.write(json.dumps(man, indent=1) + '\n')


if __name__ == '__main__':
    main()
