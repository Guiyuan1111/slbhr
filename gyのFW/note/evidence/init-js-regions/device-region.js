define("States/Level/Devices/Device", ["Phaser"], function () {
			"use strict";
			var c;
			return (
				(c = c = (function (c) {
					function d(b, c) {
						(this.sounds = a(this.sounds, this)),
							(this.ocupy = a(this.ocupy, this)),
							(this.ocupyTile = a(this.ocupyTile, this)),
							(this.checkState = a(this.checkState, this)),
							(this.updateState = a(this.updateState, this)),
							(this._updateState = a(this._updateState, this)),
							(this.updateLight = a(this.updateLight, this)),
							(this.setupLight = a(this.setupLight, this)),
							(this.getColor = a(this.getColor, this)),
							(this.registerDevice = a(this.registerDevice, this)),
							(this.pxm = a(this.pxm, this)),
							(this.mpx = a(this.mpx, this));
						var e, f, g, h, i;
						(this.lights = []),
							(g = {}),
							_.deepObjectExtend(g, this._defaults),
							c.properties || (c.properties = {}),
							_.deepObjectExtend(g, c),
							_.deepObjectExtend(g, this.options),
							(this.options = g),
							null == this.options.layer && (this.options.layer = "overGround"),
							(e = this.options).rotation || (e.rotation = 0),
							(this.options.rotation = (Math.PI * this.options.rotation) / 180),
							(this.options.width = b.physics.box2d.pxm(this.options.width)),
							(this.options.height = b.physics.box2d.pxm(this.options.height)),
							(h = this.options.x),
							(i = this.options.y),
							(this.state = null != this.options.properties ? +this.options.properties.initialState || 0 : 0),
							d.__super__.constructor.call(this, b),
							null != this.options.atlasName &&
								null != this.options.frameName &&
								((this.sprite = this.game.make.resSprite(h, i, this.options.atlasName, this.options.frameName)), this.game.layers[this.options.layer].addChild(this.sprite), this.sprite.anchor.set(0.5)),
							null != this.sprite && (this.sprite.autoCull = !0),
							this.sprite &&
								this.options.enableBody === !0 &&
								(this.game.physics.box2d.enable(this.sprite), this.sprite.body.clearFixtures(), this.sprite.body.data.SetAngle((Math.PI * c.rotation) / 180 || 0), (this.body = this.sprite.body)),
							null != this.options.lightAtlas &&
								null != this.options.lightFrame &&
								((f = this.create(0, 0, this.options.lightAtlas, this.options.lightFrame + "_on0000")),
								null != this.sprite && this.sprite.addChild(f),
								f.anchor.set(0.5),
								(f.offFrameName = this.options.lightFrame + "_off0000"),
								(f.onFrameName = this.options.lightFrame + "_on0000"),
								(f.frameName = f.offFrameName),
								this.lights.push(f)),
							_.defer(
								(function (a) {
									return function () {
										return a.updateLight(a.state);
									};
								})(this)
							);
					}
					return (
						b(d, c),
						(d.prototype._defaults = { atlasName: null, frameName: null, lightAtlas: null, lightFrame: null }),
						(d.prototype.mpx = function (a) {
							return this.game.physics.box2d.mpx(-1 * a);
						}),
						(d.prototype.pxm = function (a) {
							return this.game.physics.box2d.pxm(-1 * a);
						}),
						(d.prototype.registerDevice = function () {
							if ((this.game.MechManager.registerDevice(this), this.lights.length > 0)) return this.setupLight();
						}),
						(d.prototype.getColor = function () {
							var a;
							return (a = Number(String(this.options.properties.group)[0])), d.groupColors[a] || "#ffffff";
						}),
						(d.prototype.setupLight = function () {
							var a, b, c, d, e;
							for (e = this.lights, b = 0, d = e.length; b < d; b++) (c = e[b]), (a = this.getColor()), (c.offTint = Phaser.Color.hexToColor(a).color), (c.onTint = Phaser.Color.hexToColor(a).color), (c.tint = c.offTint);
						}),
						(d.prototype.updateLight = function (a) {
							var b, c, d, e, f;
							if (0 !== this.lights.length) {
								for (e = this.lights, f = [], b = 0, d = e.length; b < d; b++)
									(c = e[b]),
										null != c.onFrameName && a
											? ((c.frameName = c.onFrameName), f.push((c.tint = c.onTint)))
											: null == c.offFrameName || a
											? f.push(void 0)
											: ((c.frameName = c.offFrameName), f.push((c.tint = c.offTint)));
								return f;
							}
						}),
						(d.prototype.update = function () {
							return this.checkState();
						}),
						(d.prototype._updateState = function () {
							return this.updateLight(this.state), this.updateState();
						}),
						(d.prototype.updateState = function () {}),
						(d.prototype.checkState = function () {}),
						(d.prototype.ocupyTile = function (a, b, c) {
							if (null != a[Math.floor(c)] && null != a[Math.floor(c)][Math.floor(b)]) return (a[Math.floor(c)][Math.floor(b)].ocupied = !0);
						}),
						(d.prototype.ocupy = function (a, b) {
							return !1;
						}),
						(d.prototype.sounds = function () {
							return [];
						}),
						d
					);
				})(Phaser.Group)),
				(c.groupColors = { 1: "#ff0000", 2: "#00cc00", 3: "#0D3EFF", 4: "#ffff00", 5: "#EC0EF1", 6: "#57beff", 7: "#9933FF" }),
				c
			);
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
			c = {}.hasOwnProperty;
		define("States/Level/Devices/BoxedDevice", ["./Device"], function (c) {
			"use strict";
			var d;
			return (d = d = (function (c) {
				function d(b, c) {
					this.ocupy = a(this.ocupy, this);
					var e;
					(this._defaults.enableBody = !0),
						(e = new box2d.b2Vec2(b.physics.box2d.mpx(this.boxSize.x / 2), b.physics.box2d.mpx(this.boxSize.y / 2))),
						(e = e.SelfRotateRadians((-Math.PI * c.rotation) / 180 || 0)),
						(c.x = c.x + e.x),
						(c.y = c.y - e.y),
						d.__super__.constructor.call(this, b, c);
				}
				return (
					b(d, c),
					(d.prototype.boxSize = { x: 2, y: 2 }),
					(d.prototype.ocupy = function (a) {
						var b, c;
						return (b = this.options.x / 32), (c = this.options.y / 32), this.ocupyTile(a, b, c), this.ocupyTile(a, b - 1, c - 1), this.ocupyTile(a, b - 1, c), this.ocupyTile(a, b, c - 1);
					}),
					d
				);
			})(c));
		});
	}.call(this),
	function () {
		var a = function (a, c) {
				function d() {
					this.constructor = a;
				}
				for (var e in c) b.call(c, e) && (a[e] = c[e]);
				return (d.prototype = c.prototype), (a.prototype = new d()), (a.__super__ = c.prototype), a;
			},
			b = {}.hasOwnProperty;
		define("States/Level/Devices/Ball", ["./BoxedDevice"], function (b) {
			"use strict";
			var c;
			return (c = c = (function (b) {
				function c(a, b) {
					var d, e, f, g;
					return (
						(b.x -= a.physics.box2d.mpx(0.5)),
						(b.y += a.physics.box2d.mpx(0.65)),
						c.__super__.constructor.call(this, a, b),
						(g = new box2d.b2CircleShape(this.radius)),
						(f = new box2d.b2FixtureDef()),
						(f.shape = g),
						(f.friction = 0.2),
						(f.restitution = 0.1),
						(f.density = 2.3),
						(f.filter.categoryBits = 17),
						(e = this.body.data.CreateFixture(f)),
						(e.id = this.body.world.getNextFixtureId()),
						null != this.options.properties && null != this.options.properties.linearDamping && this.body.data.SetLinearDamping(this.options.properties.linearDamping),
						null != this.options.properties && null != this.options.properties.angularDamping && this.body.data.SetAngularDamping(this.options.properties.angularDamping),
						(d = new box2d.b2CircleShape(0.1)),
						d.m_p.SetXY(0, 0),
						(f = new box2d.b2FixtureDef()),
						(f.shape = d),
						(f.filter.categoryBits = 4096),
						(f.filter.maskBits = 4096),
						(f.friction = 0.5),
						(f.density = 0),
						(f.userData = { "portal-sensor": !0 }),
						(e = this.body.data.CreateFixture(f)),
						(e.id = this.body.world.getNextFixtureId()),
						this
					);
				}
				return a(c, b), (c.prototype.options = { boxWidth: 1.8, boxHeight: 1.8, atlasName: "MechAssets", frameName: "ball0000" }), (c.prototype.radius = 0.4), c;
			})(b));
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
			c = {}.hasOwnProperty;
		define("States/Level/Devices/Beamer", ["./BoxedDevice"], function (c) {
			"use strict";
			var d;
			return (d = d = (function (c) {
				function d(b, c) {
					(this.drawDarkMask = a(this.drawDarkMask, this)), (this.drawBeam = a(this.drawBeam, this)), (this.update = a(this.update, this)), (this.getColor = a(this.getColor, this));
					var e, f, g, h, i;
					return (
						(this.state = 1),
						d.__super__.constructor.call(this, b, c),
						(this.body.mass = 0),
						(i = []),
						i.push(new box2d.b2Vec2(0, -this.options.pusherWidth / 2 - 0.6)),
						i.push(new box2d.b2Vec2(0, this.options.pusherWidth / 2 + 0.6)),
						i.push(new box2d.b2Vec2(-this.options.pusherHeight, this.options.pusherWidth / 2)),
						i.push(new box2d.b2Vec2(-this.options.pusherHeight, -this.options.pusherWidth / 2)),
						(h = new box2d.b2PolygonShape()),
						h.Set(i),
						(f = new box2d.b2FixtureDef()),
						(f.shape = h),
						(f.friction = 0.7),
						(f.restitution = 0),
						(f.density = 0),
						(f.filter.categoryBits = 1),
						(f.filter.maskBits = 65535),
						(e = this.body.data.CreateFixture(f)),
						(e.id = this.body.world.getNextFixtureId()),
						(g = this.game.make.sprite(0, 0, "MechAssets", "beamer_light_off0000")),
						g.anchor.set(0.5),
						this.sprite.addChild(g),
						(g.offFrameName = "beamer_light_off0000"),
						(g.onFrameName = "beamer_light_on0000"),
						this.lights.push(g),
						this.registerDevice(),
						(this.graphics = this.game.make.graphics(0, 0)),
						this.game.layers.lights.addChild(this.graphics),
						this.game.layers.dust.sources.push(this),
						(this.graphicsColor = Phaser.Color.hexToColor(this.getColor()).color),
						this
					);
				}
				return (
					b(d, c),
					(d.prototype.options = { pusherWidth: 0.8, pusherHeight: 0.4, atlasName: "MechAssets", frameName: "beamer0000", layer: "overGround" }),
					(d.prototype.getColor = function () {
						switch (this.options.properties.color) {
							case "blue":
								return "#AAEAFF";
							case "red":
								return "#FF4D00";
							default:
								return "#ffff88";
						}
					}),
					(d.prototype.update = function () {
						var a, b, c, d, e, f, g, h, i, j, k, l;
						if (((this.dirty = !1), 1 !== this.state)) return null !== this.points && (this.dirty = !0), (this.points = null), this.graphics.clear();
						for (
							a = new box2d.b2RayCastCallback(),
								a.ReportFixture = function (a, b, c, d) {
									if (null == a.m_userData || null == a.m_userData.lightProperties) return (this.contact = { point: b.Clone(), normal: null }), d;
									if ("transparent" !== a.m_userData.lightProperties.type)
										return "normal" === a.m_userData.lightProperties.type
											? ((this.contact = { point: b.Clone(), normal: null }), a.m_userData.lightProperties.sensor && (this.contact.sensor = a), d)
											: "mirror" === a.m_userData.lightProperties.type
											? ((this.contact = { point: b.Clone(), normal: c.Clone() }), a.m_userData.lightProperties.sensor && (this.contact.sensor = a), d)
											: "portal" === a.m_userData.lightProperties.type
											? 1 === a.m_userData.device.state
												? ((this.contact = { point: a.m_userData.lightProperties.getPoint(b, c), output: a.m_userData.lightProperties.getOutput, skipPoint: b.Clone() }), d)
												: void 0
											: void (a.m_userData.lightProperties.sensor && (this.contact.sensor = a));
								},
								a.point = new box2d.b2Vec2(this.pxm(this.options.x), this.pxm(this.options.y)),
								c = new box2d.b2Vec2(-1, 0),
								c = c.SelfRotateRadians(this.options.rotation || 0),
								a.dir = c,
								j = [],
								j.push({ point: a.point.Clone() });
							null != a.dir && j.length < 11;

						)
							(h = a.point.Clone()),
								(i = a.point.Clone().SelfAdd(a.dir.Clone().SelfMul(50))),
								(a.contact = null),
								this.body.world.world.RayCast(a, h, i),
								null != a.contact &&
									((a.point = a.contact.point),
									null != a.contact.sensor && ((a.contact.sensor.m_userData.lightProperties.iluminated = this.options.properties.color), (a.contact.sensor.m_userData.lightProperties.lightAt = a.contact.point)),
									a.contact.skipPoint ? (j.push({ type: "line", point: a.contact.skipPoint.Clone() }), j.push({ type: "move", point: a.point.Clone() })) : j.push({ type: "line", point: a.point.Clone() }),
									null != a.contact.output
										? (a.dir = a.contact.output(a.dir))
										: null != a.contact.normal
										? ((b = h.Clone().SelfSub(i).SelfNormalize()), (f = a.contact.normal.Clone().SelfCrossVS(1)), (a.dir = b.Clone().SelfSub(f.Clone().SelfMul(2 * b.Clone().Dot(f)))))
										: (a.dir = null));
						if (((l = [30, 10, 2]), (g = [0.05, 0.3, 1]), !_.isEqual(this.points, j))) {
							for (this.graphics.clear(), this.dirty = !0, this.points = j, this.graphics.blendMode = PIXI.blendModes.LIGHTEN, k = [], d = e = 1; e <= 2; d = ++e)
								this.graphics.lineStyle(l[d], this.graphicsColor, g[d]), k.push(this.drawBeam(this.graphics, j));
							return k;
						}
					}),
					(d.prototype.drawBeam = function (a, b, c) {
						var d, e, f, g, h;
						for (null == c && (c = { x: 0, y: 0 }), a.moveTo(this.mpx(b[0].point.x) + c.x, this.mpx(b[0].point.y) + c.y), h = [], d = e = 0, f = b.length; e < f; d = ++e)
							(g = b[d]),
								d > 0
									? "line" === g.type
										? (a.lineTo(this.mpx(g.point.x) + c.x, this.mpx(g.point.y) + c.y), h.push(a.moveTo(this.mpx(g.point.x) + c.x, this.mpx(g.point.y) + c.y)))
										: "move" === g.type
										? h.push(a.moveTo(this.mpx(g.point.x) + c.x, this.mpx(g.point.y) + c.y))
										: h.push(void 0)
									: h.push(void 0);
						return h;
					}),
					(d.prototype.drawDarkMask = function (a) {
						var b, c;
						if (1 === this.state && null != this.points)
							return (
								(a.ctx.globalCompositeOperation = "lighter"),
								a.ctx.beginPath(),
								(a.ctx.lineCap = "round"),
								(a.ctx.strokeStyle = "rgba(255,255,255,0.8)"),
								(a.ctx.lineWidth = 25),
								this.drawBeam(a.ctx, this.points, a.offset),
								a.ctx.stroke(),
								a.ctx.closePath(),
								(c = { x: this.sprite.x + a.offset.x, y: this.sprite.y + a.offset.y }),
								(b = a.ctx.createRadialGradient(c.x, c.y, 30, c.x, c.y, 90)),
								b.addColorStop(0, "rgba(255,255,255,1)"),
								b.addColorStop(0.5, "rgba(255,255,255,0.3)"),
								b.addColorStop(1, "transparent"),
								a.circle(c.x, c.y, 90, b)
							);
					}),
					d
				);
			})(c));
		});
	}.call(this),
	function () {
		var a = function (a, c) {
				function d() {
					this.constructor = a;
				}
				for (var e in c) b.call(c, e) && (a[e] = c[e]);
				return (d.prototype = c.prototype), (a.prototype = new d()), (a.__super__ = c.prototype), a;
			},
			b = {}.hasOwnProperty;
		define("States/Level/Devices/BoxPrototype", ["./BoxedDevice"], function (b) {
			"use strict";
			var c;
			return (c = c = (function (b) {
				function c(a, b) {
					var d, e, f, g, h, i, j, k, l;
					return (
						c.__super__.constructor.call(this, a, b),
						null != this.options.properties.boxSize && ((this.options.boxWidth = this.options.properties.boxSize), (this.options.boxWidth = this.options.properties.boxSize)),
						(this.sprite.cacheAsBitmap = !0),
						(g = 0.1),
						(k = new box2d.b2PolygonShape()),
						(l = []),
						l.push(new box2d.b2Vec2(-this.options.boxWidth / 2 + g, -this.options.boxHeight / 2)),
						l.push(new box2d.b2Vec2(this.options.boxWidth / 2 - g, -this.options.boxHeight / 2)),
						l.push(new box2d.b2Vec2(this.options.boxWidth / 2, -this.options.boxHeight / 2 + g)),
						l.push(new box2d.b2Vec2(this.options.boxWidth / 2, +this.options.boxHeight / 2 - g)),
						l.push(new box2d.b2Vec2(this.options.boxWidth / 2 - g, +this.options.boxHeight / 2)),
						l.push(new box2d.b2Vec2(-this.options.boxWidth / 2 + g, +this.options.boxHeight / 2)),
						l.push(new box2d.b2Vec2(-this.options.boxWidth / 2, +this.options.boxHeight / 2 - g)),
						l.push(new box2d.b2Vec2(-this.options.boxWidth / 2, -this.options.boxHeight / 2 + g)),
						k.Set(l.reverse()),
						(i = new box2d.b2FixtureDef()),
						(i.shape = k),
						(i.friction = null != this.options.properties.friction ? this.options.properties.friction : 0.4),
						(i.restitution = 0),
						(i.density = this.options.density),
						(h = this.body.data.CreateFixture(i)),
						(h.id = this.body.world.getNextFixtureId()),
						(this.boxFixture = h),
						(j = (function (a) {
							return function (b, c) {
								var d;
								return (
									(d = new box2d.b2CircleShape(b)),
									d.m_p.SetXY(c[0], c[1]),
									(i = new box2d.b2FixtureDef()),
									(i.shape = d),
									(i.filter.categoryBits = 17),
									(i.filter.maskBits = 4097),
									(i.friction = a.options.circleFriction),
									(i.density = 0),
									(i.userData = { lightProperties: { type: "transparent" } }),
									(h = a.body.data.CreateFixture(i)),
									(h.id = a.body.world.getNextFixtureId()),
									h
								);
							};
						})(this)),
						(d = g),
						(f = this.options.boxWidth / 2 - 0.6 * g),
						j(d, [-f, -f]),
						j(d, [f, -f]),
						j(d, [-f, f]),
						j(d, [f, f]),
						(e = new box2d.b2CircleShape(0.1)),
						e.m_p.SetXY(0, 0),
						(i = new box2d.b2FixtureDef()),
						(i.shape = e),
						(i.filter.categoryBits = 4096),
						(i.filter.maskBits = 4096),
						(i.friction = 0.5),
						(i.density = 0),
						(i.userData = { "portal-sensor": !0, lightProperties: { type: "transparent" } }),
						(h = this.body.data.CreateFixture(i)),
						(h.id = this.body.world.getNextFixtureId()),
						this.body.data.SetLinearDamping(1),
						this.body.data.SetAngularDamping(20),
						this
					);
				}
				return a(c, b), (c.prototype.options = { boxWidth: 1.77, boxHeight: 1.77, atlasName: "MechAssets", frameName: "movingbox0000", layer: "overGround", density: 0.45, circleFriction: 0.1 }), c;
			})(b));
		});
	}.call(this),
	function () {
		var a = function (a, c) {
				function d() {
					this.constructor = a;
				}
				for (var e in c) b.call(c, e) && (a[e] = c[e]);
				return (d.prototype = c.prototype), (a.prototype = new d()), (a.__super__ = c.prototype), a;
			},
			b = {}.hasOwnProp