import { describe, expect, it } from "vitest";
import { evaluateFull } from "./strudelRuntime";
import { STRUDEL_API } from "./strudelApi";

const run = (code: string, cycles = 4) => evaluateFull(code, cycles);
const count = async (code: string, cycles = 1) => (await run(code, cycles)).events.length;

describe("every function of the Strudel API is available", () => {
  it("defines all names and synonyms in the evaluation scope", async () => {
    await run('note("c4")', 1);
    const P = (globalThis as any).Pattern.prototype; // eslint-disable-line @typescript-eslint/no-explicit-any
    const missing = STRUDEL_API.flat().filter((n) => !(n in globalThis) && !(n in P));
    expect(missing).toEqual([]);
  });
});

// examples taken from the Strudel reference: none of them may fail
const EXAMPLES: string[] = [
  `note("[c3 bb2 f3 eb3]*2").sound("sawtooth").lpf(600).adsr(".1:.1:.5:.2")`,
  `note("c3 e3 f3 g3").attack("<0 .1 .5>")`,
  `note("c3 e3 f3 g3").decay("<.1 .2 .3 .4>").sustain(0)`,
  `$: n(run(8)).scale("c:minor").s("sawtooth").delay(.7).orbit(2)\n$: s("bd:4!4").beat("0,4,8,11,14",16).duckorbit(2).duckattack("<0.2 0 0.4>").duckdepth(1)`,
  `$: n(run(8)).scale("c:minor").s("sawtooth").delay(.7).orbit(2)\n$: s("hh*16").orbit(5)\n$: s("bd:4!4").beat("0,4,8,11,14",16).duckorbit("2:5").duckattack("0.4:0.1")`,
  `stack( n(run(8)).scale("c:minor").s("sawtooth").delay(.7).orbit(2), s("bd:4!4").beat("0,4,8,11,14",16).duckorbit(2).duckattack(0.2).duckdepth("<1 .9 .6 0>"))`,
  `sound: freq("63.2388").s("sine").orbit(2).gain(4)\nducker: s("bd*4").duckorbit(2).duckattack(0.3).duckonset(0.01).postgain(0)`,
  `s("bd*4").bank("tr909").duckorbit("4:7").duckonset("0.3:0.003").duckattack(0.25)`,
  `s("hh*8").gain(".4!2 1 .4!2 1 .4 1").fast(2)`,
  `s("bd sd [~ bd] sd,hh*8").compressor("-20:20:10:.002:.02").postgain(1.5)`,
  `note("c3 e3 g3 c4").release("<0 .1 .4 .6 1>/2")`,
  `setGainCurve((x) => x * x)\ns("bd*4").gain(0.5)`,
  `note("c3 e3 f3 g3").decay(.2).sustain("<0 .1 .4 .6 1>")`,
  `note("d d d# d".fast(4)).s("supersaw").tremolo("<3 2 100> ").tremoloskew("<.5>")`,
  `note("a1 a1 a#1 a1".fast(4)).s("pulse").tremsync(4).tremolodepth("<1 2 .7>")`,
  `note("{f a c e}%16").s("sawtooth").tremsync(4).tremolophase("<0 .25 .66>")`,
  `note("{f g c d}%16").tremsync(4).tremoloshape("<sine tri square>").s("sawtooth")`,
  `note("{f a c e}%16").s("sawtooth").tremsync(4).tremoloskew("<.5 0 1>")`,
  `note("d d d# d".fast(4)).s("supersaw").tremolosync("4").tremoloskew("<1 .5 0>")`,
  `s("hh*8").gain(".4!2 1 .4!2 1 .4 1").velocity(".4 1")`,
  `xfade(s("bd*2"), "<0 .25 .5 .75 1>", s("hh*8"))`,
  `$: sound("bd - cp sd")\n$: sound("hh*8")\nall(fast("<2 3>"))`,
  `$: sound("bd - cp sd")\n$: sound("hh*8")\nall(x => x.pianoroll())`,
  `"<c3 eb3 g3>".scale('C minor').apply(scaleTranspose("0,2,4")).note()`,
  `arrange([4, "<c a f e>(3,8)"], [2, "<g a>(5,8)"]).note()`,
  `"c:.5 a:1 f:.25 e:.8".as("note:clip")`,
  `"{0@2 0.25 0 0.5 .3 .5}%8".as("begin").s("sax_vib").clip(1)`,
  `$: sound("bd - cp sd")\n$: sound("hh*8")\neach(fast("<2 3>"))`,
  `let a = s("bd(3,8)")\nlet b = s("cp sd")\n"<a b [a,b]>".inhabit({ a, b })`,
  `s("a@2 [a b] a").inhabit({a: "bd(3,8)", b: "sd sd"}).slow(4)`,
  `note("c a f e").keep(note("e f a c").s("piano"))`,
  `"<0 2 4 6 ~ 4 ~ 2 0!3 ~!5>*8".layer(x=>x.add("0,2")).scale('C minor').note()`,
  `note("<0 1 2!2 3>".pick(["g a", "e f", "f g f g" , "g c d"]))`,
  `sound("<0 1 [2,0]>".pick(["bd sd", "cp cp", "hh hh"]))`,
  `sound("<0!2 [0,1] 1>".pick(["bd(3,8)", "sd sd"]))`,
  `s("<a!2 [a,b] b>".pick({a: "bd(3,8)", b: "sd sd"}))`,
  `s("bd [rim hh]").pickF("<0 1 2>", [rev,jux(rev),fast(2)])`,
  `note("<c2 d2>(3,8)").s("square").pickF("<0 2> 1", [jux(rev), fast(2), x=>x.lpf(800)])`,
  `note("<c2 d2>(3,8)").s("square").pickF("<jr l> f", { jr:jux(rev), f:fast(2), l:x=>x.lpf(800) })`,
  `"<a@2 b@2 c@2 d@2>".pickRestart({ a: n("0 1 2 0"), b: n("2 3 4 ~"), c: n("[4 5] [4 3] 2 0"), d: n("0 -3 0 ~") }).scale("C:major").s("piano")`,
  `note("<0*4 1 2*2 3*3>".pickOut(["g a", "e f", "f g f g" , "g c d"]))`,
  `seq("e5", "b4", ["d5", "c5"]).note()`,
  `s("hh*4").seq(note("c4(5,8)"))`,
  `seqPLoop([0, 2, "bd(3,8)"],[1, 3, "cp(3,8)"]).sound()`,
  `note("c a f e").s("sine").set(s("triangle"))`,
  `setDefaultJoin('mix')\ns("saw").vel("1 0.5").note("F A C E").delay("0 0.2 0.3")`,
  `slowcat("e5", "b4", ["d5", "c5"])`,
  `squeeze("<0@2 [1!2] 2>", ["g a", "f g f g" , "g a c d"]).note()`,
  `stackCenter("0 1 2 3", "3 4", "[4 5 6] 7 8 9 10").scale("c:minor").note()`,
  `"0 1 2 3".stackCenter("3 4", "[4 5 6] 7 8 9 10").scale("c:minor").note()`,
  `stackLeft("0 1 2 3", "3 4", "[4 5 6] 7 8 9 10").scale("c:minor").note()`,
  `"0 1 2 3".stackLeft("3 4", "[4 5 6] 7 8 9 10").scale("c:minor").note()`,
  `stackRepeat("0 1 2 3", "3 4", "[4 5 6] 7 8 9 10").scale("c:minor").note()`,
  `"0 1 2 3".stackRepeat("3 4", "[4 5 6] 7 8 9 10").scale("c:minor").note()`,
  `stackRight("0 1 2 3", "3 4", "[4 5 6] 7 8 9 10").scale("c:minor").note()`,
  `"0 1 2 3".stackRight("3 4", "[4 5 6] 7 8 9 10").scale("c:minor").note()`,
  `"<0 2 4 6 ~ 4 ~ 2 0!3 ~!5>*8".superimpose(x=>x.add(2)).scale('C minor').note()`,
  // tempo + visual / device / sample functions never break evaluation
  `setcpm(140/4)\n$: note("c4 e4 g4 c5").pianoroll()`,
  `samples('github:tidalcycles/dirt-samples')\nnote("c4").s("piano").scope().spiral().midi()`,
  `note("c4").osc().punchcard().wordfall().markcss("color:red").fscope().spectrum()`,
  `note("c4 e4").juxFlip(rev).juxFlipBy(.5, rev).isobite("x ~ x x")`,
  `n("0 1 2").scale("C:major").note().add(accX).add(rotX.range(0,1))`,
  `hush()\nnote("c4")`,
];

describe("reference examples evaluate without failing", () => {
  for (const code of EXAMPLES) {
    it(code.split("\n")[0].slice(0, 70), async () => {
      await expect(run(code, 2)).resolves.toBeTruthy();
    });
  }
});

describe("REPL semantics", () => {
  it("$: patterns are stacked", async () => {
    expect(await count(`$: note("c4 e4")\n$: note("g4")`)).toBe(3);
  });
  it("_ muted and S solo", async () => {
    expect(await count(`$: note("c4 e4")\n_$: note("g4")`)).toBe(2);
    expect(await count(`$: note("c4 e4")\nS$: note("g4")`)).toBe(1);
  });
  it("d1 / p2 style labels", async () => {
    expect(await count(`note("c4").d1\nnote("e4 g4").p(2)`)).toBe(3);
  });
  it("all(fast(2)) transforms the whole stack, each() every pattern", async () => {
    expect(await count(`$: note("c4")\n$: note("e4")\nall(fast(2))`)).toBe(4);
    expect(await count(`$: note("c4")\n$: note("e4 g4")\neach(fast(2))`)).toBe(6);
  });
  it("hush clears labelled patterns defined before it", async () => {
    expect(await count(`$: note("c4 e4")\nhush()\n$: note("g4")`)).toBe(1);
  });
  it("setcpm / setcps report the tempo, evaluations do not leak it", async () => {
    expect((await run(`setcpm(30)\nnote("c4")`)).cpm).toBe(30);
    expect((await run(`setcps(1)\nnote("c4")`)).cpm).toBe(60);
    expect((await run(`setcpm(140/4)\nnote("c4")`)).cpm).toBe(35);
    expect((await run(`note("c4")`)).cpm).toBeNull();
  });
  it("cpm() sets the speed of a pattern relative to the tempo", async () => {
    expect(await count(`setcpm(60)\nnote("c4").cpm(120)`, 1)).toBe(2);
  });
  it("setcpm with a bad value is a clear error", async () => {
    await expect(run(`setcpm(-3)\nnote("c4")`)).rejects.toThrow(/positivo/);
  });
});

describe("functions added on top of the published packages", () => {
  it("stackCenter aligns shorter patterns in the middle", async () => {
    expect(await count(`stackCenter("0 1 2 3", "3 4").note()`)).toBe(6);
    expect(await count(`stackCentre("0 1 2 3", "3 4").note()`)).toBe(6);
  });
  it("stackRepeat repeats shorter patterns to the longest step count", async () => {
    expect(await count(`stackRepeat("0 1 2 3", "3 4").note()`)).toBe(8);
  });
  it("juxFlip stacks the transformed and the original copy", async () => {
    expect(await count(`note("c4 e4").juxFlip(rev)`)).toBe(4);
  });
  it("isquare is the inverse of square", async () => {
    const a = await run(`note("c4*4").gain(isquare)`, 1);
    const b = await run(`note("c4*4").gain(square)`, 1);
    const g = (r: typeof a) => r.events.map((x) => x.gain);
    expect(g(a)).toEqual(g(b).map((v) => 1 - (v as number)));
  });
  it("isobite lays the values of a pattern over a repeating structure", async () => {
    expect(await count(`note("c4 e4 g4").isobite("x x")`)).toBeGreaterThan(0);
  });
  it("aliases: delays / distortion / datt / fme / pwr / pws / bb", async () => {
    await expect(run(`note("c4").delays(.5).distortion(2).datt(.1).fme(1).pwr(2).pws(1)`)).resolves.toBeTruthy();
  });
  it("setDefaultJoin accepts every alignment", async () => {
    for (const m of ["in", "out", "mix", "squeeze", "squeezeout", "reset", "restart", "poly"]) {
      await expect(run(`setDefaultJoin('${m}')\nnote("0 1".add("10 20 30"))`)).resolves.toBeTruthy();
    }
    await run(`setDefaultJoin('in')\nnote("c4")`);
  });
});
