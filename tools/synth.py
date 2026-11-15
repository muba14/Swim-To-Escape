"""Swim to Escape: Octopus — original chiptune music + sound effects.

Everything here is synthesized from scratch with numpy, so the audio is 100%
original and royalty-free (released as CC0 together with the game).

Run:  python3 tools/synth.py      -> writes assets/audio/*.wav and music.mp3
"""
import os, subprocess, wave
import numpy as np

SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'assets', 'audio')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)


# ---------- building blocks ----------
def t_(dur):
    return np.arange(int(SR * dur)) / SR


def note_hz(name):
    """'A4', 'C#5', 'Eb3' -> Hz"""
    names = {'C': -9, 'D': -7, 'E': -5, 'F': -4, 'G': -2, 'A': 0, 'B': 2}
    n = names[name[0]]
    rest = name[1:]
    if rest[0] == '#': n += 1; rest = rest[1:]
    elif rest[0] == 'b': n -= 1; rest = rest[1:]
    octave = int(rest)
    return 440.0 * 2 ** ((n + (octave - 4) * 12) / 12)


def osc(kind, freq, dur, duty=0.5):
    t = t_(dur)
    f = np.broadcast_to(freq, t.shape) if np.ndim(freq) else np.full(t.shape, freq)
    ph = np.cumsum(f) / SR
    ph -= np.floor(ph)
    if kind == 'sine':
        return np.sin(2 * np.pi * ph)
    if kind == 'tri':
        return 4 * np.abs(ph - 0.5) - 1
    if kind == 'pulse':
        return np.where(ph < duty, 1.0, -1.0)
    if kind == 'saw':
        return 2 * ph - 1
    raise ValueError(kind)


def noise(dur):
    return rng.uniform(-1, 1, int(SR * dur))


def env(n, a=0.005, d=0.0, s=1.0, r=0.05, dur=None):
    """ADSR envelope of n samples."""
    e = np.ones(n) * s
    A = int(a * SR); D = int(d * SR); R = int(r * SR)
    A = min(A, n); e[:A] = np.linspace(0, 1, A, endpoint=False) if A else e[:A]
    if D: e[A:A + D] = np.linspace(1, s, min(D, n - A))[:len(e[A:A + D])]
    if R: e[-R:] *= np.linspace(1, 0, min(R, n))[-len(e[-R:]):]
    return e


def expdecay(n, k):
    return np.exp(-k * np.arange(n) / SR)


def lowpass(x, cutoff):
    """one-pole low-pass; cutoff may be a float or an array"""
    c = np.broadcast_to(cutoff, x.shape) if np.ndim(cutoff) else np.full(x.shape, cutoff)
    a = 1 - np.exp(-2 * np.pi * c / SR)
    y = np.empty_like(x); acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc); y[i] = acc
    return y


def echo(x, delay=0.18, fb=0.35, mix=0.35, taps=4):
    d = int(delay * SR)
    y = np.concatenate([x, np.zeros(d * taps)])
    out = y.copy()
    g = 1.0
    for k in range(1, taps + 1):
        g *= fb
        out[d * k:] += y[:len(y) - d * k] * g * mix / fb
    return out


def write_wav(name, x, peak=0.9):
    x = np.asarray(x, dtype=np.float64)
    m = np.max(np.abs(x)) or 1
    x = x / m * peak
    pcm = (x * 32767).astype(np.int16)
    path = os.path.join(OUT, name)
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    return path


# ---------- sound effects ----------
def sfx_swim():
    # bubbly whoosh: filtered noise swell + rising "bloop"
    d = 0.22
    n = noise(d)
    cut = np.linspace(600, 2600, len(n))
    w = lowpass(n, cut) * env(len(n), a=0.03, r=0.15)
    f = np.linspace(260, 640, int(SR * d))
    b = osc('sine', f, d) * expdecay(int(SR * d), 18)
    return 0.55 * w + 0.6 * b


def sfx_bump():
    d = 0.12
    f = np.linspace(170, 70, int(SR * d))
    x = osc('sine', f, d) * expdecay(int(SR * d), 30)
    x += 0.25 * lowpass(noise(d), 500) * expdecay(int(SR * d), 45)
    return x


def sfx_pearl(i):
    # short glassy blip; pitch climbs a pentatonic scale as you chain pearls
    scale = ['E5', 'G5', 'A5', 'C6', 'D6', 'E6', 'G6', 'A6']
    f = note_hz(scale[i])
    d = 0.07
    x = osc('pulse', f, d, duty=0.25) * 0.35 + osc('sine', f * 2, d) * 0.4
    return x * expdecay(int(SR * d), 55) * env(int(SR * d), a=0.002, r=0.01)


def sfx_star():
    out = []
    for k, nm in enumerate(['C6', 'E6', 'G6', 'C7']):
        d = 0.075
        x = osc('pulse', note_hz(nm), d, duty=0.125) * expdecay(int(SR * d), 20)
        out.append(x)
    x = np.concatenate(out)
    return echo(x, 0.09, 0.4, 0.5, 3)


def sfx_shell():
    a = osc('pulse', note_hz('B5'), 0.06, 0.5) * 0.6
    b = osc('pulse', note_hz('E6'), 0.22, 0.5) * expdecay(int(SR * 0.22), 9) * 0.6
    return np.concatenate([a, b])


def sfx_hurt():
    d = 0.45
    f = np.linspace(520, 90, int(SR * d))
    x = osc('saw', f * (1 + 0.04 * np.sin(2 * np.pi * 30 * t_(d))), d)
    x = lowpass(x, 1800) * env(int(SR * d), a=0.005, r=0.2)
    nz = lowpass(noise(d), 900) * expdecay(int(SR * d), 12) * 0.5
    return x + nz


def sfx_win():
    seq = [('C5', .1), ('E5', .1), ('G5', .1), ('C6', .2), ('G5', .1), ('C6', .45)]
    out = []
    for nm, d in seq:
        f = note_hz(nm)
        x = (osc('pulse', f, d, 0.25) * 0.5 + osc('tri', f / 2, d) * 0.5)
        out.append(x * env(int(SR * d), a=0.004, r=0.03))
    return echo(np.concatenate(out), 0.12, 0.35, 0.35, 3)


def sfx_lose():
    seq = [('E4', .18), ('Eb4', .18), ('D4', .18), ('C#4', .6)]
    out = []
    for nm, d in seq:
        f = note_hz(nm)
        vib = 1 + (0.012 * np.sin(2 * np.pi * 6 * t_(d)) if d > .3 else 0)
        x = osc('pulse', f * vib, d, 0.5) * 0.5 + osc('tri', f / 2, d) * 0.5
        out.append(lowpass(x, 2200) * env(int(SR * d), a=0.004, r=0.05))
    return np.concatenate(out)


def sfx_tap():
    d = 0.05
    x = osc('pulse', note_hz('A5'), d, 0.25) * expdecay(int(SR * d), 60)
    return x



def sfx_break():
    # coral crunch: noisy burst + falling click pieces
    d = .25
    x = lowpass(noise(d), 2600) * expdecay(int(SR * d), 22)
    for k in range(4):
        dd = .04; f = 900 - k * 150
        place_np(x, osc('pulse', f, dd, .3) * expdecay(int(SR * dd), 60) * .5, .02 + k * .045)
    return x


def sfx_portal():
    d = .35
    t = t_(d)
    f = 300 + 900 * t / d + 120 * np.sin(2 * np.pi * 18 * t)
    x = osc('sine', f, d) * .6 + osc('tri', f * 1.5, d) * .3
    return echo(x * env(int(SR * d), a=.02, r=.15), .07, .4, .4, 3)


def sfx_ink():
    d = .45
    x = lowpass(noise(d), np.linspace(1800, 200, int(SR * d))) * env(int(SR * d), a=.005, r=.3)
    f = np.linspace(180, 60, int(SR * d))
    return x * .8 + osc('sine', f, d) * expdecay(int(SR * d), 8) * .6


def sfx_shield():
    # bubble pop
    d = .16
    f = np.linspace(400, 1400, int(SR * d))
    x = osc('sine', f, d) * expdecay(int(SR * d), 18)
    pop = lowpass(noise(.03), 5000) * expdecay(int(SR * .03), 120)
    out = np.concatenate([x, pop])
    return out


def sfx_powerup():
    out = []
    for nm in ['A4', 'C#5', 'E5', 'A5', 'C#6', 'E6']:
        d = .05
        out.append(osc('pulse', note_hz(nm), d, .25) * env(int(SR * d), a=.002, r=.01))
    return echo(np.concatenate(out), .08, .35, .4, 3)


def sfx_achieve():
    seq = [('G5', .09), ('C6', .09), ('E6', .09), ('G6', .35)]
    out = []
    for nm, d in seq:
        f = note_hz(nm)
        x = osc('pulse', f, d, .125) * .5 + osc('sine', f * 2, d) * .3
        out.append(x * env(int(SR * d), a=.003, r=.04))
    return echo(np.concatenate(out), .11, .45, .5, 4)


def sfx_buy():
    a = osc('pulse', note_hz('E6'), .05, .5) * .6
    b = osc('pulse', note_hz('A6'), .18, .5) * expdecay(int(SR * .18), 12) * .6
    return np.concatenate([a, b])


def sfx_crack():  # warning tick when a puffer is about to puff (unused in mix if too busy)
    d = .05
    return osc('pulse', 1200, d, .5) * expdecay(int(SR * d), 80)


def place_np(buf, x, start):
    i = int(start * SR); j = min(len(buf), i + len(x))
    buf[i:j] += x[:j - i]


# ---------- music ----------
# Five original tracks, one per world + endless mode. The reef track has a
# hand-written melody; the others get a seeded, rule-based melody (chord tones
# on strong beats, scale steps in between), so they are original as well.
SCALES = {
    'A_minor': ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
    'D_dorian': ['D', 'E', 'F', 'G', 'A', 'B', 'C'],
    'E_harm': ['E', 'F#', 'G', 'A', 'B', 'C', 'D#'],
    'F#_minor': ['F#', 'G#', 'A', 'B', 'C#', 'D', 'E'],
}
REEF_MELODY = [
    ('E5', 1), ('C5', .5), ('D5', .5), ('E5', 1), ('A4', 1),
    ('F5', 1.5), ('E5', .5), ('C5', 1), ('A4', 1),
    ('G5', 1), ('E5', .5), ('C5', .5), ('D5', 1), ('E5', 1),
    ('D5', 1.5), ('B4', .5), ('G4', 2),
    ('A4', .5), ('C5', .5), ('E5', .5), ('A5', .5), ('G5', 1), ('E5', 1),
    ('F5', .5), ('E5', .5), ('C5', 1), ('A4', 2),
    ('E5', .5), ('G5', .5), ('C6', 1), ('B5', .5), ('G5', .5), ('E5', 1),
    ('D5', 1), ('B4', 1), ('E5', 2),
]
TRACKS = {
    'reef': dict(bpm=104, scale='A_minor', arp=16, drums='soft', cutoff=4200, seed=1,
                 chords=[('A2', 'A3 C4 E4'), ('F2', 'F3 A3 C4'), ('C3', 'C4 E4 G4'), ('G2', 'G3 B3 D4')],
                 melody=REEF_MELODY),
    'coral': dict(bpm=116, scale='D_dorian', arp=16, drums='soft', cutoff=4600, seed=2,
                  chords=[('D3', 'D4 F4 A4'), ('G2', 'G3 B3 D4'), ('C3', 'C4 E4 G4'), ('A2', 'A3 C4 E4')]),
    'wreck': dict(bpm=96, scale='E_harm', arp=8, drums='shanty', cutoff=3600, seed=3,
                  chords=[('E2', 'E3 G3 B3'), ('E2', 'E3 G3 B3'), ('D3', 'D4 F#4 A4'), ('D3', 'D4 F#4 A4'),
                          ('C3', 'C4 E4 G4'), ('C3', 'C4 E4 G4'), ('B2', 'B3 D#4 F#4'), ('B2', 'B3 D#4 F#4')]),
    'trench': dict(bpm=84, scale='F#_minor', arp=8, drums='sparse', cutoff=2800, seed=4,
                   chords=[('F#2', 'F#3 A3 C#4'), ('D2', 'D3 F#3 A3'), ('B1', 'B2 D3 F#3'), ('C#2', 'C#3 F3 G#3')]),
    'endless': dict(bpm=138, scale='A_minor', arp=16, drums='driving', cutoff=5000, seed=5,
                    chords=[('A2', 'A3 C4 E4'), ('G2', 'G3 B3 D4'), ('F2', 'F3 A3 C4'), ('E2', 'E3 G#3 B3')]),
}
RHYTHMS = [[1, .5, .5, 1, 1], [1.5, .5, 1, 1], [.5, .5, .5, .5, 1, 1], [1, 1, 2],
           [.5, .5, 1, .5, .5, 1], [1, .5, .5, 2], [.75, .25, .5, .5, 1, 1]]


def gen_melody(tr, bars):
    r = np.random.default_rng(tr['seed'])
    sc = SCALES[tr['scale']]
    ladder = [f'{n}{o}' for o in (4, 5, 6) for n in sc]
    ladder = sorted(ladder, key=note_hz)
    lo = next(i for i, n in enumerate(ladder) if note_hz(n) >= note_hz('A4') * .99)
    hi = next(i for i, n in enumerate(ladder) if note_hz(n) >= note_hz('A5') * .99)
    mel = []; cur = (lo + hi) // 2
    motif = None
    for b in range(bars):
        tones = [t[:-1] for t in tr['chords'][b % len(tr['chords'])][1].split()]
        if b % 4 == 2 and motif:          # repeat the bar-0 rhythm for shape
            rhythm = motif
        else:
            rhythm = list(RHYTHMS[r.integers(len(RHYTHMS))])
        if b == bars - 1:
            rhythm = [1, 1, 2]
        if b == 0:
            motif = rhythm
        pos = 0
        for k, d in enumerate(rhythm):
            strong = abs(pos - round(pos)) < 1e-6 and int(round(pos)) % 2 == 0
            if strong or k == len(rhythm) - 1:
                cands = [i for i in range(lo, hi + 1) if ladder[i][:-1] in tones]
                cur = min(cands, key=lambda i: abs(i - cur) + r.random() * 2.5)
            else:
                cur = int(np.clip(cur + r.choice([-2, -1, -1, 1, 1, 2]), lo, hi))
            if b == bars - 1 and k == len(rhythm) - 1:
                root = tr['chords'][0][1].split()[0][:-1]
                cur = min([i for i in range(lo, hi + 1) if ladder[i][:-1] == root], key=lambda i: abs(i - cur))
            rest = r.random() < .08 and not strong
            mel.append((None if rest else ladder[cur], d))
            pos += d
    return mel


def music(name):
    tr = TRACKS[name]
    beat = 60 / tr['bpm']; bars = 16
    chords = (tr['chords'] * 16)[:bars]
    loop_len = bars * 4 * beat
    n = int(loop_len * SR) + SR * 3
    bass = np.zeros(n); arp = np.zeros(n); lead = np.zeros(n); drum = np.zeros(n); fx = np.zeros(n)
    step = beat / (4 if tr['arp'] == 16 else 2)
    drums = tr['drums']
    for bar, (root, tones) in enumerate(chords):
        tones = tones.split()
        b0 = bar * 4 * beat
        rf = note_hz(root)
        pat = [(0, 1, .9), (1.5, 2, .4), (2, 1, .9), (3.5, 2, .4)]
        if drums == 'driving':
            pat = [(k * .5, 1 if k % 2 == 0 else 2, .45) for k in range(8)]
        if drums == 'sparse':
            pat = [(0, 1, 3.8)]
        if drums == 'shanty':
            pat = [(0, 1, .9), (1, 1.5, .9), (2, 1, .9), (3, 1.5, .9)]
        for off, mul, d in pat:
            x = osc('tri', rf * mul, d * beat) * env(int(d * beat * SR), a=.005, r=.06)
            place(bass, x, b0 + off * beat)
        apat = [0, 1, 2, 1, 0, 1, 2, 3, 0, 1, 2, 1, 0, 2, 1, 2] if tr['arp'] == 16 else [0, 2, 1, 2, 3, 2, 1, 2]
        for k, idx in enumerate(apat):
            f = note_hz(tones[idx % 3]) * (2 if idx == 3 else 1)
            dd = step * .9
            x = osc('pulse', f * 2, dd, .125) * expdecay(int(dd * SR), 14 if tr['arp'] == 16 else 6)
            place(arp, x, b0 + k * step)
        kicks = {'soft': (0, 2), 'shanty': (0, 2), 'sparse': (0,), 'driving': (0, 1, 2, 3)}[drums]
        for bt in kicks:
            d = .18; f = np.linspace(110, 45, int(SR * d))
            place(drum, osc('sine', f, d) * expdecay(int(SR * d), 22), b0 + bt * beat)
        if drums != 'sparse':
            for e in range(8):
                d = .04
                hat = lowpass(noise(d), 7000) - lowpass(noise(d), 2500)
                place(drum, hat * expdecay(int(SR * d), 90) * (0.35 if e % 2 else 0.2), b0 + e * beat / 2)
        snares = {'soft': (3,) if bar >= 8 and bar % 2 == 1 else (), 'shanty': (1, 3),
                  'driving': (1, 3), 'sparse': ()}[drums]
        for bt in snares:
            d = .12
            place(drum, lowpass(noise(d), 3000) * expdecay(int(SR * d), 30) * .5, b0 + bt * beat)
        for _ in range(2 if drums != 'sparse' else 3):
            d = .12; st = b0 + rng.uniform(0, 4) * beat
            f = np.linspace(rng.uniform(500, 800), rng.uniform(1200, 1800), int(SR * d))
            place(fx, osc('sine', f, d) * expdecay(int(SR * d), 25), st)
    mel = tr.get('melody') or gen_melody(tr, 8)
    starts = [8] if name != 'endless' else [0, 8]
    for sb in starts:
        pos = sb * 4 * beat
        for nm, beats in mel:
            d = beats * beat
            if nm:
                f = note_hz(nm); t = t_(d)
                vib = 1 + 0.006 * np.sin(2 * np.pi * 5.5 * t) * np.clip(t / .25, 0, 1)
                x = osc('pulse', f * vib, d, 0.25) * 0.6 + osc('tri', f * vib, d) * 0.4
                place(lead, x * env(int(SR * d), a=.01, d=.1, s=.7, r=.06), pos)
            pos += d
    arp = echo(lowpass(arp, 2400), beat * .75, .4, .45, 3)[:n]
    lead = echo(lowpass(lead, 3200), beat * .75, .3, .3, 3)[:n]
    if drums == 'sparse':
        lead = echo(lead, beat * 1.5, .5, .5, 4)[:n]
    mix = 0.55 * bass + 0.22 * arp + 0.32 * lead + 0.5 * drum + 0.08 * fx
    mix = lowpass(mix, tr['cutoff'])
    L = int(loop_len * SR)
    loop = mix[:L].copy(); tail = mix[L:]
    loop[:len(tail)] += tail
    return loop, loop_len


def place(buf, x, start):
    i = int(start * SR)
    j = min(len(buf), i + len(x))
    buf[i:j] += x[:j - i]


PAD = 1.0  # seconds of wrapped audio on both ends of each music file


if __name__ == '__main__':
    fx = {
        'swim': sfx_swim(), 'bump': sfx_bump(), 'star': sfx_star(), 'shell': sfx_shell(),
        'hurt': sfx_hurt(), 'win': sfx_win(), 'lose': sfx_lose(), 'tap': sfx_tap(),
        'break': sfx_break(), 'portal': sfx_portal(), 'ink': sfx_ink(), 'shield': sfx_shield(),
        'powerup': sfx_powerup(), 'achieve': sfx_achieve(), 'buy': sfx_buy(),
    }
    for i in range(8):
        fx[f'pearl{i}'] = sfx_pearl(i)
    peaks = {'pearl': 0.5, 'bump': 0.6, 'tap': 0.5, 'shell': 0.6, 'buy': 0.6}
    for name, x in fx.items():
        write_wav(name + '.wav', x, peaks.get(name.rstrip('0123456789'), 0.85))
    for f in ('music.wav', 'music.mp3'):
        p = os.path.join(OUT, f)
        if os.path.exists(p): os.remove(p)
    meta = {}
    for name in TRACKS:
        loop, L = music(name)
        p = int(PAD * SR)
        padded = np.concatenate([loop[-p:], loop, loop[:p]])
        tmp = write_wav(f'_{name}.wav', padded, 0.8)
        # MP3 keeps the files small. The loop is played from PAD to PAD+L, a
        # window of the periodic signal, so encoder delay cannot cause a gap.
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', tmp, '-ar', '22050', '-ac', '1',
                        '-c:a', 'libmp3lame', '-b:a', '64k', os.path.join(OUT, f'music_{name}.mp3')], check=True)
        os.remove(tmp)
        meta[name] = round(L, 4)
    import json
    json.dump({'pad': PAD, 'loops': meta}, open(os.path.join(OUT, 'music.json'), 'w'))
    print('written to', os.path.abspath(OUT), meta)
