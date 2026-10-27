/**
 * seedrandom（David Bau ARC4 实现）官方 init.js 提取体——@1826037 起 2717 字节，字节级零改动。
 *
 * 历史教训：曾以字符串字面量内联 + new Function 注入 AMD define shim 加载——CSP
 * （0.3.51 #45，script-src 'self' + 内联哈希）禁 eval 后 new Function 当场抛 EvalError，
 * GameScene.create 在 decorate 的 z() 步进处炸掉，场景永停 CREATING：0.3.51–0.3.55
 * 浏览器建房进房全断，而 node 侧 e2e（route-node）不加载浏览器 bundle，四版未察觉。
 * 本文件把同一份代码以真实源码形态入编译图（CSP 合规），包裹仅两处：
 * ① define 由 UMD 自由变量改为参数（AMD 注册分支照旧可达）；
 * ② module/require 以 var 遮蔽——浏览器恒走 AMD 分支，node 分支本就不可达，
 *    遮蔽同时让打包器不把 require("crypto") 当外部依赖解析。
 * IIFE 直接调用的 this 在 ESM（strict）下为 undefined：仅 h() 自动种子路径消费
 * （k.navigator/k.crypto），本项目恒传种子（GameScene decorate），不触达。
 * 行为等值性由 seedrandom-parity 单测钉死（旧路径 10000 步序列锚）。
 * 合规：官方代码仅限私人联机使用，禁止分发（同 vendor/box2d.js）。
 */
// 官方原文为压缩 JS，TS 类型检查（implicit any 等）不适用——文件级关停；vitest 侧
// 行为由 seedrandom-parity 锚钉死，类型面只暴露 runSeedrandom 一个入口。
// @ts-nocheck
/* eslint-disable */
// prettier-ignore
export function runSeedrandom(define: (name: string, deps: unknown[], factory: () => unknown) => void): void {
  var module: any; var require: any;
!(function (a, b) {
		function c(c, j, k) {
			var n = [];
			j = 1 == j ? { entropy: !0 } : j || {};
			var s = g(f(j.entropy ? [c, i(a)] : null == c ? h() : c, 3), n),
				t = new d(n),
				u = function () {
					for (var a = t.g(m), b = p, c = 0; a < q; ) (a = (a + c) * l), (b *= l), (c = t.g(1));
					for (; a >= r; ) (a /= 2), (b /= 2), (c >>>= 1);
					return (a + c) / b;
				};
			return (
				(u.int32 = function () {
					return 0 | t.g(4);
				}),
				(u.quick = function () {
					return t.g(4) / 4294967296;
				}),
				(u.double = u),
				g(i(t.S), a),
				(
					j.pass ||
					k ||
					function (a, c, d, f) {
						return (
							f &&
								(f.S && e(f, t),
								(a.state = function () {
									return e(t, {});
								})),
							d ? ((b[o] = a), c) : a
						);
					}
				)(u, s, "global" in j ? j.global : this == b, j.state)
			);
		}
		function d(a) {
			var b,
				c = a.length,
				d = this,
				e = 0,
				f = (d.i = d.j = 0),
				g = (d.S = []);
			for (c || (a = [c++]); e < l; ) g[e] = e++;
			for (e = 0; e < l; e++) (g[e] = g[(f = s & (f + a[e % c] + (b = g[e])))]), (g[f] = b);
			(d.g = function (a) {
				for (var b, c = 0, e = d.i, f = d.j, g = d.S; a--; ) (b = g[(e = s & (e + 1))]), (c = c * l + g[s & ((g[e] = g[(f = s & (f + b))]) + (g[f] = b))]);
				return (d.i = e), (d.j = f), c;
			})(l);
		}
		function e(a, b) {
			return (b.i = a.i), (b.j = a.j), (b.S = a.S.slice()), b;
		}
		function f(a, b) {
			var c,
				d = [],
				e = typeof a;
			if (b && "object" == e)
				for (c in a)
					try {
						d.push(f(a[c], b - 1));
					} catch (a) {}
			return d.length ? d : "string" == e ? a : a + "\0";
		}
		function g(a, b) {
			for (var c, d = a + "", e = 0; e < d.length; ) b[s & e] = s & ((c ^= 19 * b[s & e]) + d.charCodeAt(e++));
			return i(b);
		}
		function h() {
			try {
				var b;
				return j && (b = j.randomBytes) ? (b = b(l)) : ((b = new Uint8Array(l)), (k.crypto || k.msCrypto).getRandomValues(b)), i(b);
			} catch (b) {
				var c = k.navigator,
					d = c && c.plugins;
				return [+new Date(), k, d, k.screen, i(a)];
			}
		}
		function i(a) {
			return String.fromCharCode.apply(0, a);
		}
		var j,
			k = this,
			l = 256,
			m = 6,
			n = 52,
			o = "random",
			p = b.pow(l, m),
			q = b.pow(2, n),
			r = 2 * q,
			s = l - 1;
		if (((b["seed" + o] = c), g(b.random(), a), "object" == typeof module && module.exports)) {
			module.exports = c;
			try {
				j = require("crypto");
			} catch (a) {}
		} else
			"function" == typeof define &&
				define.amd &&
				define("seedrandom", [], function () {
					return c;
				});
	})([], Math)
}
