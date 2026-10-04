erty;
		define("States/Level/Ground", ["./Devices/Liquid", "./Devices/Snow", "seedrandom"], function (c, d, e) {
			"use strict";
			var f;
			return (f = f = (function (f) {
				function g(b, c, d) {
					(this.CreateLiquid = a(this.CreateLiquid, this)),
						(this.CreateSnow = a(this.CreateSnow, this)),
						(this.CreateSnows = a(this.CreateSnows, this)),
						(this.createGroundFixture = a(this.createGroundFixture, this)),
						(this.destroy = a(this.destroy, this)),
						(this.drawForeground = a(this.drawForeground, this)),
						(this.decorate = a(this.decorate, this)),
						(this.getNaviesPoints = a(this.getNaviesPoints, this)),
						(this.getTileAt = a(this.getTileAt, this)),
						(this.drawTile = a(this.drawTile, this));
					var e;
					(this.options = _.extend(this.options, d)),
						g.__super__.constructor.call(this, b),
						this.game.physics.box2d.enable(this),
						(this.body.mass = 0),
						this.body.clearFixtures(),
						(this.mapData = c),
						(this.options.width = this.mapData.width * this.mapData.tileWidth),
						(this.options.height = this.mapData.height * this.mapData.tileHeight),
						(e = this.convertTilemap(this.mapData)),
						this.CreateSnows(this.mapData),
						this.game.physics.box2d.setBounds(-100, -100, this.options.width + 200, this.options.height + 200),
						this.drawForeground(),
						this.applyFilter();
				}
				return (
					b(g, f),
					(g.prototype.options = { tileWidth: 32, tileHeight: 32, key: "map" }),
					(g.prototype.filterPadding = 10),
					(g.prototype.getTileRight = function (a, b, c) {
						return null != a.data[c] && null != a.data[c][b + 1] ? a.data[c][b + 1] : null;
					}),
					(g.prototype.getTileLeft = function (a, b, c) {
						return null != a.data[c] && null != a.data[c][b - 1] ? a.data[c][b - 1] : null;
					}),
					(g.prototype.getTileUp = function (a, b, c) {
						return null != a.data[c - 1] && null != a.data[c - 1][b] ? a.data[c - 1][b] : null;
					}),
					(g.prototype.getTileDown = function (a, b, c) {
						return null != a.data[c + 1] && null != a.data[c + 1][b] ? a.data[c + 1][b] : null;
					}),
					(g.prototype.drawTile = function (a, b, c, d) {
						var e, f, g, h;
						return (
							10 === d && (d = 0),
							11 === d && (d = 1),
							12 === d && (d = 2),
							55 === d && (d = 5),
							0 === d ? ((h = Math.floor(4 * Math.random())), (g = "MaskBox0000" + h)) : (g = "MaskBox" + d + "0000"),
							(e = this.game.cache.getFrameByName("GroundAssets", g)),
							(f = this.game.cache.getImage("GroundAssets")),
							(b = b - (e.width - 32) / 2 + 32),
							(c = c - (e.height - 32) / 2 + 32),
							a.drawImage(f, e.x, e.y, e.width, e.height, b, c, e.width, e.height)
						);
					}),
					(g.prototype.getTileAt = function (a, b) {
						return this.mapData.layers[0].data[b][a];
					}),
					(g.prototype.convertTilemap = function (a) {
						var b, c, d, e, f, g, h, i, j, k, l, m, n, o, p, q, r, s, t, u, v, w, x, y, z, A, B, C;
						for (
							m = 0,
								this.map = a,
								A = 0,
								v = 0,
								w = 0,
								C = 0,
								this.h = h = a.height,
								this.w = z = a.width,
								this.groundBody = c = this.body,
								this.groundBody.data.m_userData = "ground",
								this.game.level.groundBody = this.groundBody.data,
								n = this.game.add.bitmapData(this.options.width + 64, this.options.height + 64);
							C < h;

						) {
							for (A = 0, B = 0; B < z; )
								(x = a.layers[m].data[C][B]),
									x &&
										x.index > -1 &&
										((d = B * this.options.tileWidth),
										(e = C * this.options.tileHeight),
										0 === x.properties.type
											? (0 === A && ((v = B * x.width), (w = C * x.height), (A = 1)),
											  (r = this.getTileRight(a.layers[m], B, C)),
											  r && 0 === r.properties.type
												  ? ((A += 1), this.drawTile(n.ctx, d, e, x.properties.type))
												  : ((t = new box2d.b2PolygonShape()),
													(y = []),
													(u = this.groundBody.world.pxm(c.world.mpx(1) * A)),
													(s = this.groundBody.world.pxm(c.world.mpx(1))),
													y.push(new box2d.b2Vec2(0, 0)),
													y.push(new box2d.b2Vec2(-u, 0)),
													y.push(new box2d.b2Vec2(-u, -s)),
													y.push(new box2d.b2Vec2(0, -s)),
													_.each(y, function (a) {
														return (a.x -= c.world.pxm(v)), (a.y -= c.world.pxm(w));
													}),
													t.Set(y),
													(A = 0),
													this.createGroundFixture(t),
													this.drawTile(n.ctx, d, e, x.properties.type)))
											: 5 === x.properties.type || 6 === x.properties.type || 7 === x.properties.type || 55 === x.properties.type
											? (0 === A && ((v = B * x.width), (w = C * x.height), (A = 1)),
											  (r = this.getTileRight(a.layers[m], B, C)),
											  r && r.properties.type === x.properties.type
												  ? (A > 1 && this.drawTile(n.ctx, d, e, x.properties.type), (A += 1))
												  : ((t = this.createGroundShape(8, new box2d.b2Vec2(c.world.pxm(d) - A + 1, c.world.pxm(e)))),
													this.createGroundFixture(t),
													this.drawTile(n.ctx, d - c.world.mpx(A - 1), e, 8),
													(t = this.createGroundShape(9, new box2d.b2Vec2(c.world.pxm(d), c.world.pxm(e)))),
													this.createGroundFixture(t),
													this.drawTile(n.ctx, d, e, 9),
													(t = new box2d.b2PolygonShape()),
													(y = []),
													(u = this.groundBody.world.pxm(c.world.mpx(1) * A)),
													(s = this.groundBody.world.pxm(c.world.mpx(1))),
													y.push(new box2d.b2Vec2(-1, -s / 2 + 0.05)),
													y.push(new box2d.b2Vec2(-u + 1, -s / 2 + 0.05)),
													y.push(new box2d.b2Vec2(-u + 1, -s)),
													y.push(new box2d.b2Vec2(-1, -s)),
													_.each(y, function (a) {
														return (a.x -= c.world.pxm(v)), (a.y -= c.world.pxm(w));
													}),
													t.Set(y),
													this.createGroundFixture(t),
													this.CreateLiquid(x.properties.type, B + 1, C, A),
													(A = 0)))
											: x.properties.type === -1
											? this.drawTile(n.ctx, d, e, 0)
											: ((t = this.createGroundShape(x.properties.type, new box2d.b2Vec2(c.world.pxm(d), c.world.pxm(e)))), this.createGroundFixture(t), this.drawTile(n.ctx, d, e, x.properties.type))),
									B++;
							C++;
						}
						for (
							f = this.game.make.bitmapData(this.options.width + 64, this.options.height + 64),
								g = this.game.cache.getFrameByName("TempleAssets", "ForeGround0000"),
								j = this.game.cache.getImage("TempleAssets"),
								i = l = 0,
								p = Math.ceil(this.options.width / 256);
							0 <= p ? l <= p : l >= p;
							i = 0 <= p ? ++l : --l
						)
							for (k = o = 0, q = Math.ceil(this.options.height / 256); 0 <= q ? o <= q : o >= q; k = 0 <= q ? ++o : --o) (B = 256 * i), (C = 256 * k), f.ctx.drawImage(j, g.x, g.y, g.width, g.height, B, C, g.width, g.height);
						return (b = this.game.add.bitmapData(this.options.width + 64, this.options.height + 64)), b.alphaMask(f, n), (this.bmd = b), (this.maskBmd = n), (this.foregroundBmd = f), c;
					}),
					(g.prototype.getNaviesPoints = function () {
						var a, b, c, d, f, g, h, i, j, k, l, m, n;
						for (
							i = this.map,
								d = this.h,
								n = this.w,
								g = 0,
								b = this.groundBody,
								this.rng = e("ASDFA"),
								m = (function (a) {
									return function () {
										return Math.round(3 * a.rng() + 3.5);
									};
								})(this),
								j = (function (a) {
									return function (a, b) {
										return null != i.layers[g].data[a] && null != i.layers[g].data[a][b] ? i.layers[g].data[a][b] : null;
									};
								})(this),
								l = [
									{ x: Math.floor(d / 4), y: Math.floor(d / 4) },
									{ x: Math.floor((3 * d) / 4), y: Math.floor(d / 4) },
									{ x: Math.floor(d / 4), y: Math.floor((3 * d) / 4) },
									{ x: Math.floor((3 * d) / 4), y: Math.floor(d / 4) },
								],
								a = (function (a) {
									return function (a) {
										return a > 0 ? 1 : a < 0 ? -1 : 0;
									};
								})(this),
								f = 0,
								h = l.length;
							f < h;
							f++
						)
							for (k = l[f], k.valid = !1, c = { x: a(Math.random() - 0.5), y: a(Math.random() - 0.5) }; k.x > 0 && k.x < n && k.y > 0 && k.y < d; ) {
								if (null == j(k.y, k.x).properties.type) {
									k.valid = !0;
									break;
								}
								(k.x += c.x), (k.y += c.y);
							}
						return (
							(l = l.filter(function (a) {
								return a.valid;
							})),
							_.each(l, function (a) {
								return (a.x *= b.world.mpx(1)), (a.y *= b.world.mpx(1));
							}),
							l
						);
					}),
					(g.prototype.decorate = function (a) {
						var b, c, d, f, g, h, i, j, k, l, m, n, o, p, q, r, s, t, u, v, w, x, y, z, A, B, C, D, E, F, G, H, I, J, K;
						for (
							s = this.map,
								k = this.h,
								H = this.w,
								o = 0,
								c = this.groundBody,
								this.rng = e("ASDFA"),
								z = (function (a) {
									return function () {
										return Math.round(3 * a.rng() + 3.5);
									};
								})(this),
								n = 0,
								q = a.length;
							n < q;
							n++
						)
							(v = a[n]), null != v.ocupy && v.ocupy(s.layers[o].data);
						for (
							t = (function (a) {
								return function (a, b) {
									return null != s.layers[o].data[a] && null != s.layers[o].data[a][b] ? s.layers[o].data[a][b] : null;
								};
							})(this),
								K = 1,
								f = [],
								g = new Phaser.RenderTexture(this.game, this.options.width + 64, this.options.height + 64, "decosTexture", void 0, 1);
							K < k;

						) {
							for (I = 0, J = 1; J < H - 1; ) {
								for (F = s.layers[o].data[K][J], l = x = 0; x <= 6; l = ++x) {
									for (j = null, m = y = 0; y <= 6; m = ++y)
										if (
											((h = Math.max(Math.min(J + l, H - 2), 0)),
											(i = Math.max(Math.min(K + m, k - 1), 0)),
											null != t(i, h).properties.type &&
												!t(i, h).ocupied &&
												f.indexOf(t(i, h)) < 0 &&
												f.indexOf(t(i - 1, h)) < 0 &&
												f.indexOf(t(i, h + 1)) < 0 &&
												f.indexOf(t(i - 1, h + 1)) < 0 &&
												f.indexOf(t(i, h - 1)) < 0 &&
												f.indexOf(t(i - 1, h - 1)) < 0)
										) {
											(j = s.layers[o].data[i][h]), f.push(j);
											break;
										}
									if (null != j) break;
								}
								J += z();
							}
							K += z();
						}
						for (w = 0, l = E = 0, r = f.length; E < r; l = ++E)
							(d = f[l]),
								(F = s.layers[o].data[d.y][d.x]),
								(b = this.getTileUp(s.layers[o], d.x, d.y)),
								(A = this.getTileRight(s.layers[o], d.x, d.y)),
								(p = this.getTileLeft(s.layers[o], d.x, d.y)),
								(G = null),
								(B = 0),
								(C = [1, 1]),
								(u = 1),
								0 === F.properties.type && null != b && null != b.properties.type && null != A && null != A.properties.type && null != p && null != p.properties.type
									? ((G = "O_" + ((w % 2) + 1)), (B = "1" === w ? (Math.floor(3 * Math.random()) * Math.PI) / 2 : 0))
									: 0 !== F.properties.type || (null != b && null != b.properties.type)
									? 0 === F.properties.type
										? ((G = "X"), (B = (Math.floor(3 * Math.random()) * Math.PI) / 2))
										: 1 === F.properties.type
										? (G = "A")
										: 2 === F.properties.type
										? ((G = "A"), (C = [-1, 1]))
										: 3 === F.properties.type
										? (G = "V")
										: 4 === F.properties.type && ((G = "V"), (C = [-1, 1]))
									: ((G = "T_" + ((w % 3) + 1)), (u = 2 * Math.round(Math.random()) - 1)),
								w++,
								null != G &&
									((D = this.game.make.sprite((d.x + 0.5) * c.world.mpx(1), (d.y + 0.5) * c.world.mpx(1), "TempleAssets", "decor_" + G + "0000")),
									(D.rotation = B),
									D.scale.set(u * C[0], C[1]),
									D.anchor.set(0.5),
									g.renderXY(D, D.x + 32, D.y + 32, !1),
									D.destroy());
						return (
							this.game.cache.addRenderTexture("decosTexture", g),
							(D = this.game.make.sprite(-32, -32, this.game.cache.getRenderTexture("decosTexture").texture)),
							this.game.layers.decorations.addChild(D),
							(this.game.layers.decorations.cacheAsBitmap = !0)
						);
					}),
					(g.prototype.drawForeground = function () {
						return (this.image = this.game.make.image(0, 0, this.bmd));
					}),
					(g.prototype.applyFilter = function () {
						var a, b, c, d, e, f, g;
						return (
							(a = this.game.make.tileSprite(0, 0, this.options.width, this.options.height, "TempleAssets", "BackGround0000")),
							this.game.layers.background.addChild(a),
							(a.cacheAsBitmap = !0),
							(g = this.options.width + 64),
							(b = this.options.height + 64),
							(c = new Phaser.Filter.InlineFilter(this.game, g, b, 3, 16711680)),
							c.init(),
							(d = new Phaser.Filter.OutlineFilter(this.game, g, b, 3.5, 0)),
							d.init(),
							(f = new Phaser.Filter.ShadowFilter(this.game, g, b, 8, 0)),
							f.init(),
							(this.image.filters = [c, d, f]),
							(e = new Phaser.RenderTexture(this.game, g, b, "groundTexture", void 0, 1)),
							(this.game.renderer.renderSession.resolution = 1),
							e.renderRawXY(this.image, 0, 0, !0),
							(this.game.renderer.renderSession.resolution = this.game.resolution),
							this.game.cache.addRenderTexture("groundTexture", e),
							(this.sprite = this.game.make.sprite(-32, -32, this.game.cache.getRenderTexture("groundTexture").texture)),
							this.game.layers.ground.addChild(this.sprite),
							(this.sprite.cacheAsBitmap = !0),
							this.image.destroy(),
							this.bmd.destroy(),
							this.maskBmd.destroy(),
							this.foregroundBmd.destroy()
						);
					}),
					(g.prototype.destroy = function () {
						return this.sprite.destroy(), this.image.destroy(), this.bmd.destroy(), this.maskBmd.destroy(), this.foregroundBmd.destroy(), g.__super__.destroy.call(this);
					}),
					(g.prototype.createGroundFixture = function (a, b, c) {
						var d, e;
						return (
							(e = new box2d.b2FixtureDef()),
							(e.shape = a),
							(e.filter.categoryBits = 1),
							(e.filter.maskBits = 4369),
							(e.friction = 0.8),
							(e.isSensor = b),
							(e.userData = c),
							(d = this.groundBody.data.CreateFixture(e)),
							(d.id = this.groundBody.world.getNextFixtureId())
						);
					}),
					(g.prototype.createGroundShape = function (a, b) {
						var c, d, e, f;
						return (
							(e = 1),
							(d = 1),
							(c = new box2d.b2PolygonShape()),
							0 === a || 10 === a
								? ((f = []), f.push(new box2d.b2Vec2(0, 0)), f.push(new box2d.b2Vec2(-e, 0)), f.push(new box2d.b2Vec2(-e, -d)), f.push(new box2d.b2Vec2(0, -d)))
								: 1 === a || a === -2 || 11 === a
								? ((f = []), f.push(new box2d.b2Vec2(-e, 0)), f.push(new box2d.b2Vec2(-e, -d)), f.push(new box2d.b2Vec2(0, -d)))
								: 2 === a || 12 === a
								? ((f = []), f.push(new box2d.b2Vec2(0, 0)), f.push(new box2d.b2Vec2(-e, -d)), f.push(new box2d.b2Vec2(0, -d)))
								: 3 === a
								? ((f = []), f.push(new box2d.b2Vec2(0, 0)), f.push(new box2d.b2Vec2(-e, 0)), f.push(new box2d.b2Vec2(-e, -d)))
								: 4 === a
								? ((f = []), f.push(new box2d.b2Vec2(0, 0)), f.push(new box2d.b2Vec2(-e, 0)), f.push(new box2d.b2Vec2(0, -d)))
								: 5 === a || 6 === a || 7 === a
								? ((f = []), f.push(new box2d.b2Vec2(0, -d / 2)), f.push(new box2d.b2Vec2(-e, -d / 2)), f.push(new box2d.b2Vec2(-e, -d)), f.push(new box2d.b2Vec2(0, -d)))
								: 8 === a
								? ((f = []), f.push(new box2d.b2Vec2(0, 0)), f.push(new box2d.b2Vec2(-e - 0.3, -d / 2)), f.push(new box2d.b2Vec2(-e - 0.3, -d)), f.push(new box2d.b2Vec2(0, -d)))
								: 9 === a && ((f = []), f.push(new box2d.b2Vec2(0.3, -d / 2)), f.push(new box2d.b2Vec2(-e, 0)), f.push(new box2d.b2Vec2(-e, -d)), f.push(new box2d.b2Vec2(0.3, -d))),
							_.each(f, function (a) {
								return (a.x -= b.x), (a.y -= b.y);
							}),
							c.Set(f),
							c
						);
					}),
					(g.prototype.CreateSnows = function (a) {
						var b, c, d, e, f, g, h, i, j, k, l, m, n, o, p, q, r, s, t, u, v, w, x, y, z, A, B;
						for (c = a.layers[0].data, l = c.length, k = c[0].length, x = [], console.log("WE"), e = h = 0, o = l; 0 <= o ? h <= o : h >= o; e = 0 <= o ? ++h : --h)
							for (j = [], f = m = 0, p = k; 0 <= p ? m <= p : m >= p; f = 0 <= p ? ++m : --m)
								e >= 0 &&
									f >= 0 &&
									e < l &&
									f < k &&
									((z = c[e][f]), 10 === z.properties.type ? ("undefined" == typeof w || null === w ? (w = { x: e, y: f, length: 1, dir: "WE" }) : (w.length += 1)) : null != w && (x.push(w), (w = null)));
						for (console.log("SE"), g = n = 0, q = k + l; 0 <= q ? n <= q : n >= q; g = 0 <= q ? ++n : --n)
							for (d = [], e = y = 0, r = g; 0 <= r ? y <= r : y >= r; e = 0 <= r ? ++y : --y)
								(f = g - e),
									e >= 0 && f >= 0 && e < l && f < k && ((z = c[e][f]), 11 === z.properties.type ? (null == w ? (w = { x: e, y: f, length: 1, dir: "SE" }) : (w.length += 1)) : null != w && (x.push(w), (w = null)));
						for (console.log("SW"), g = A = s = -Math.max(k, l), t = Math.max(k, l); s <= t ? A <= t : A >= t; g = s <= t ? ++A : --A)
							for (d = [], e = B = 0, u = l; 0 <= u ? B <= u : B >= u; e = 0 <= u ? ++B : --B)
								(f = g + e),
									e >= 0 && f >= 0 && e < l && f < k && ((z = c[e][f]), 12 === z.properties.type ? (null == w ? (w = { x: e, y: f, length: 1, dir: "SW" }) : (w.length += 1)) : null != w && (x.push(w), (w = null)));
						for (console.log(x), b = 0, i = x.length; b < i; b++) (v = x[b]), this.CreateSnow(this, v);
					}),
					(g.prototype.CreateSnow = function (a, b) {
						var c;
						return (c = new d(this.game, a, b));
					}),
					(g.prototype.CreateLiquid = function (a, b, d, e) {
						var f;
						return (f = new c(this.game, b - e, d, { type: a, width: e }));
					}),
					g
				);
			})(Phaser.Sprite));
		});
	}.call(this);
(function () {
	var a = function (a, b) {
			return function () {
				return a.apply(b, arguments);
			};
		},
		b = function (a, b) {
			function d() {
				this.constructor = a;
			}
			for (var e in b) c.call(b, e) && (a[e] = b[e]);
			return (d.prototype = b.prototype), (a.prototype = new d()), (a.__super__ = b.prototype), a;
		},
		c = {}.hasOwnProperty;
	define("States/Common/TouchButton", ["./Button", "Phaser"], function (c) {
		"use strict";
		var d;
		return (d = d = (function (c) {
			function d(b, c, e, f, g, h) {
				(this.onUp = a(this.onUp, this)), (this.onDown = a(this.onDown, this)), (this.setState = a(this.setState, this));
				var i;
				"up" === f ? (i = "FingerRingJump0000") : "right" === f ? (i = "FingerRingRight0000") : "left" === f && (i = "FingerRingLeft0000"),
					d.__super__.constructor.call(this, b, c, e, "PopupAssets", i, h),
					this.sprite.anchor.set(0.5),
					this.anchor.set(0.5),
					"fb" === g ? (this.sprite.tint = 16757917) : (this.sprite.tint = 10347007),
					(this.alpha = 0.7),
					(this.initialFrame = i),
					b.TouchManager.register(
						this,
						"touchstart",
						(function (a) {
							return function () {
								return console.log("down"), (a.isDown = !0), (a.alpha = 0.3), a.onDown();
							};
						})(this)
					),
					b.TouchManager.register(
						this,
						"touchend",
						(function (a) {
							return function () {
								return console.log("up"), (a.isDown = !1), (a.alpha = 0.5), a.onUp();
							};
						})(this)
					),
					(this.hitArea = new PIXI.Circle(0, 0, this.sprite.width));
			}
			return (
				b(d, c),
				(d.prototype.customEvents = !0),
				(d.prototype.setState = function (a) {
					return "up" === a ? (this.sprite.frameName = "FingerRingJump0000") : (this.sprite.frameName = this.initialFrame), (this.sprite.cacheAsBitmap = !0);
				}),
				(d.prototype.onDown = function () {}),
				(d.prototype.onUp = function () {}),
				d
			);
		})(c));
	});
}.call(this));
(function () {
	var a = function (a, b) {
			return function () {
				return a.apply(b, arguments);
			};
		},
		b = function (a, b) {
			function d() {
				this.constructor = a;
			}
			for (var e in b) c.call(b, e) && (a[e] = b[e]);
			return (d.prototype = b.prototype), (a.prototype = new d()), (a.__super__ = b.prototype), a;
		},
		c = {}.hasOwnProperty;
	define("States/Level/CharCursors", ["../Common/TouchButton", "Phaser"], function (c) {
		"use strict";
		var d;
		return (d = d = (function (d) {
			function e(b, c) {
				(this.hide = a(this.hide, this)),
					(this.show = a(this.show, this)),
					(this.updateDowns = a(this.updateDowns, this)),
					(this.onSettingChange = a(this.onSettingChange, this)),
					(this.destroy = a(this.destroy, this)),
					e.__super__.constructor.call(this),
					(this.game = b),
					(this.id = c),
					(this.active = !1),
					b.settingsSignal.add(this.onSettingChange),
					this.setup();
			}
			return (
				b(e, d),
				(e.prototype.destroy = function () {
					return this.game.settingsSignal.remove(this.onSettingChange);
				}),
				(e.prototype.onSettingChange = function (a) {
					if ("controls" === a) return this.buttons && (this.buttons.destroy(), (this.buttons = null)), this.setup();
				}),
				(e.prototype.setup = function () {
					var a, b, d, e, f, g;
					return (
						"dual" === this.game.settings.controls
							? ((a = 0.35 * window.devicePixelRatio),
							  (b = this.buttons = this.game.make.sprite(0, 0)),
							  (d = new c(this.game, 0, 0, "left", this.id)),
							  d.scale.set(a),
							  (e = new c(this.game, 0, 0, "right", this.id)),
							  e.scale.set(a),
							  (f = new c(this.game, 0, 0, "up", this.id)),
							  f.scale.set(a),
							  (this.updateDowns = g = (function (a) {
								  return function () {
									  return (a.right.isDown = a.right.buttonDown), (a.left.isDown = a.left.buttonDown), (a.up.isDown = a.up.buttonDown), (a.active = a.up.isDown || a.left.isDown || a.right.isDown);
								  };
							  })(this)),
							  (d.onDown = (function (a) {
								  return function () {
									  return (a.left.buttonDown = !0), g();
								  };
							  })(this)),
							  (e.onDown = (function (a) {
								  return function () {
									  return (a.right.buttonDown = !0), g();
								  };
							  })(this)),
							  (f.onDown = (function (a) {
								  return function () {
									  return (a.up.buttonDown = !0), g();
								  };
							  })(this)),
							  (d.onUp = (function (a) {
								  return function () {
									  return (a.left.buttonDown = !1), g();
								  };
							  })(this)),
							  (e.onUp = (function (a) {
								  return function () {
									  return (a.right.buttonDown = !1), g();
								  };
							  })(this)),
							  (f.onUp = (function (a) {
								  return function () {
									  return (a.up.buttonDown = !1), g();
								  };
							  })(this)),
							  b.addChild(d),
							  b.addChild(e),
							  b.addChild(f),
							  (this.layoutContent = (function (c) {
								  return function () {
									  var g;
									  return (
										  (d.x = (-1.2 * a * d.sprite.width) / 2),
										  (e.x = (1.2 * a * e.sprite.width) / 2),
										  (f.y = (-1.2 * a * f.sprite.width) / 2),
										  (g =
											  "wg" === c.id
												  ? { x: -c.game.realWidth / 2 + (2 * d.sprite.width) / 3, y: c.game.realHeight / 2 - d.sprite.height / 4 }
												  : { x: c.game.realWidth / 2 - (2 * d.sprite.width) / 3, y: c.game.realHeight / 2 - d.sprite.height / 4 }),
										  (b.x = g.x),
										  (b.y = g.y)
									  );
								  };
							  })(this)),
							  this.layoutContent(),
							  this.game.layers.ui.addChild(b),
							  (this.left = { isDown: !1 }),
							  (this.right = { isDown: !1 }),
							  (this.up = { isDown: !1 }))
							: "single" === this.game.settings.controls
							? ((a = 0.5 * window.devicePixelRatio),
							  (b = this.buttons = this.game.make.group(0, 0)),
							  (d = new c(this.game, 0, 0, "left", this.id)),
							  (e = new c(this.game, 0, 0, "right", this.id)),
							  d.scale.set(a),
							  e.scale.set(a),
							  (this.layoutContent = (function (b) {
								  return function () {
									  return (
										  (d.x = -b.game.realWidth / 2 + (0.7 * a * d.sprite.width) / 2),
										  (d.y = b.game.realHeight / 2 - (0.7 * a * d.sprite.height) / 2),
										  (e.x = b.game.realWidth / 2 - (0.7 * a * e.sprite.width) / 2),
										  (e.y = b.game.realHeight / 2 - (0.7 * a * e.sprite.height) / 2)
									  );
								  };
							  })(this)),
							  this.layoutContent(),
							  (this.updateDowns = g = (function (a) {
								  return function () {
									  return (
										  a.left.buttonDown && a.right.buttonDown
											  ? (Date.now() - a.lastTouch < 80 && ((a.right.isDown = a.right.lastDown = !1), (a.left.isDown = a.left.lastDown = !1)), (a.up.isDown = !0))
											  : (a.up.isDown = !1),
										  a.left.buttonDown && !a.right.buttonDown ? ((a.left.lastDown = !0), (a.right.lastDown = !1)) : a.right.buttonDown && !a.left.buttonDown && ((a.right.lastDown = !0), (a.left.lastDown = !1)),
										  a.left.lastDown && a.left.buttonDown
											  ? ((a.left.isDown = !0), (a.right.isDown = !1), e.setState("up"), d.setState("left"))
											  : a.right.lastDown && a.right.buttonDown
											  ? ((a.right.isDown = !0), (a.left.isDown = !1), d.setState("up"), e.setState("right"))
											  : ((a.right.isDown = !1), (a.left.isDown = !1), d.setState("left"), e.setState("right")),
										  (a.active = a.buttons.visible && (a.up.isDown || a.left.isDown || a.right.isDown)),
										  (a.lastTouch = Date.now())
									  );
								  };
							  })(this)),
							  (d.onDown = (function (a) {
								  return function () {
									  return (a.left.buttonDown = !0), g();
								  };
							  })(this)),
							  (e.onDown = (function (a) {
								  return function () {
									  return (a.right.buttonDown = !0), g();
								  };
							  })(this)),
							  (d.onUp = (function (a) {
								  return function () {
									  return (a.left.buttonDown = !1), g();
								  };
							  })(this)),
							  (e.onUp = (function (a) {
								  return function () {
									  return (a.right.buttonDown = !1), g();
								  };
							  })(this)),
							  "fb" === this.id && (b.visible = !1),
							  b.addChild(d),
							  b.addChild(e),
							  this.game.layers.ui.addChild(b),
							  (this.left = { isDown: !1 }),
							  (this.right = { isDown: !1 }),
							  (this.up = { isDown: !1 }),
							  (this.up.visible = !1))
							: "wg" === this.id
							? ((this.up = this.game.input.keyboard.addKey(Phaser.Keyboard.W)), (this.left = this.game.input.keyboard.addKey(Phaser.Keyboard.A)), (this.right = this.game.input.keyboard.addKey(Phaser.Keyboard.D)))
							: ((this.up = this.game.input.keyboard.addKey(Phaser.Keyboard.UP)), (this.left = this.game.input.keyboard.addKey(Phaser.Keyboard.LEFT)), (this.right = this.game.input.keyboard.addKey(Phaser.Keyboard.RIGHT))),
						this
					);
				}),
				(e.prototype.updateDowns = function () {}),
				(e.prototype.show = function () {
					return (this.buttons.visible = !0);
				}),
				(e.prototype.hide = function () {
					return (this.buttons.visible = !1);
				}),
				e
			);
		})(Phaser.Signal));
	});
}.call(this),
	function () {
		var a = function (a, b) {
				return function () {
					return a.apply(b, arguments);
				};
			},
			b = function (a, b) {
				function d() {
					this.constructor = a;
				}
				for (var e in b) c.call(b, e) && (a[e] = b[e]);
				return (d.prototype = b.prototype), (a.prototype = new d()), (a.__super__ = b.prototype), a;
			},
			c = {}.hasOwnProp