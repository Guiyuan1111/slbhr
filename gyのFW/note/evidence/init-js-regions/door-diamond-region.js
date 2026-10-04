erty;
		define("States/Level/Devices/Box", ["./BoxedDevice", "./BoxPrototype"], function (b, c) {
			"use strict";
			var d;
			return (d = d = (function (b) {
				function c(a, b) {
					return c.__super__.constructor.call(this, a, b), this;
				}
				return a(c, b), c;
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
		define("States/Level/Devices/BoxHeavy", ["./BoxedDevice", "./BoxPrototype"], function (b, c) {
			"use strict";
			var d;
			return (d = d = (function (b) {
				function c(a, b) {
					return (b.frameName = "movingbox20000"), (b.density = 0.8), (b.circleFriction = 0.05), c.__super__.constructor.call(this, a, b), this;
				}
				return a(c, b), c;
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
		define("States/Level/Devices/BoxMirror", ["./BoxedDevice", "./BoxPrototype"], function (b, c) {
			"use strict";
			var d;
			return (d = d = (function (b) {
				function c(a, b) {
					var d, e, f;
					return (
						(b.mirrorWidth = 2),
						(b.mirrorHeight = 0.05),
						(b.frameName = "BoxMirror0000"),
						c.__super__.constructor.call(this, a, b),
						(this.boxFixture.m_userData = { lightProperties: { type: "transparent" } }),
						(f = new box2d.b2PolygonShape()),
						f.SetAsOrientedBox(this.options.mirrorWidth / 2, this.options.mirrorHeight / 2, new box2d.b2Vec2(0, 0), Math.PI / 4),
						(e = new box2d.b2FixtureDef()),
						(e.shape = f),
						(e.friction = 0),
						(e.restitution = 0),
						(e.density = 0),
						(e.userData = { lightProperties: { type: "mirror" } }),
						(d = this.body.data.CreateFixture(e)),
						(d.id = this.body.world.getNextFixtureId()),
						this
					);
				}
				return a(c, b), c;
			})(c));
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
		define("States/Level/Devices/Diamond", ["Phaser"], function () {
			"use strict";
			var c;
			return (c = c = (function (c) {
				function d(b, c, e, f) {
					this.grabbed = a(this.grabbed, this);
					var g, h, i;
					return (
						(c += b.physics.box2d.mpx(1)),
						(e -= b.physics.box2d.mpx(1)),
						d.__super__.constructor.call(this, b, c, e, "CharAssets", "_default0000"),
						this.game.physics.box2d.enable(this),
						(this.sprite = b.make.sprite(0, 0, "CharAssets", "diamond_" + f + "0000")),
						this.sprite.anchor.set(0.5),
						this.addChild(this.sprite),
						(this.signal = new Phaser.Signal()),
						this.body.clearFixtures(),
						(this.body.mass = 0),
						(i = new box2d.b2PolygonShape()),
						i.SetAsOrientedBox(this.options.width / 2, this.options.height / 2, new box2d.b2Vec2(0, 0), 0),
						(h = new box2d.b2FixtureDef()),
						(h.shape = i),
						(h.friction = 0.7),
						(h.restitution = 0),
						(h.density = 0),
						(h.userData = "diamond-" + f),
						(h.isSensor = !0),
						(h.userData = { lightProperties: { type: "transparent" } }),
						(this.data.char = f),
						(g = this.body.data.CreateFixture(h)),
						(g.id = this.body.world.getNextFixtureId()),
						this.game.layers.underGround.addChild(this),
						this.body.setFixtureContactCallback(
							g,
							(function (a) {
								return function (b, c, d, e, f, g) {
									if (null != c.sprite.character && c.sprite.character.data.char && ("silver" === a.data.char || "fbwg" === a.data.char || c.sprite.character.data.char === a.data.char) && f)
										return console.log("Grabbed!"), a.grabbed(c.sprite.character), a.signal.dispatch();
								};
							})(this),
							this
						),
						(this.sprite.y = -5),
						_.delay(
							(function (a) {
								return function () {
									var b;
									return (b = a.game.add.tween(a.sprite).to({ y: 5 }, 2e3, Phaser.Easing.Sinusoidal.InOut, !0)), b.yoyo(!0).loop();
								};
							})(this),
							2e3 * Math.random()
						),
						this
					);
				}
				return (
					b(d, c),
					(d.prototype.options = { width: 0.7, height: 0.7 }),
					(d.prototype.grabbed = function (a) {
						return this.game.level.sounds.diamond.play(), "silver" === this.data.char ? a.data.silverDiamond++ : a.data.diamonds++, this.destroy();
					}),
					d
				);
			})(Phaser.Sprite));
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
		define("States/Level/Devices/Door", ["Phaser"], function () {
			"use strict";
			var c;
			return (c = c = (function (c) {
				function d(b, c, e, f) {
					this.update = a(this.update, this);
					var g, h, i, j;
					return (
						d.__super__.constructor.call(this, b),
						(c += this.game.physics.box2d.mpx(1)),
						(this.pos = { x: c, y: e }),
						(i = "fb" === f ? "FinishBoy" : "FinishGirl"),
						(this.sprite = this.game.make.sprite(c, e + 4, "TempleAssets", i + "0000")),
						this.sprite.scale.set(0.8),
						this.sprite.animations.add("open", Phaser.Animation.generateFrameNames(i, 0, 21, "", 4), 10, !1),
						this.game.physics.box2d.enable(this.sprite),
						(this.body = this.sprite.body),
						(this.sprite.anchor.y = 0.99),
						this.game.layers.background.addChild(this.sprite),
						(this.signal = new Phaser.Signal()),
						this.body.clearFixtures(),
						this.body.data.SetType(box2d.b2BodyType.b2_staticBody),
						(j = new box2d.b2PolygonShape()),
						j.SetAsOrientedBox(this.game.physics.box2d.pxm(this.options.width / 2), this.game.physics.box2d.pxm(this.options.height / 2), new box2d.b2Vec2(0, 0), 0),
						(h = new box2d.b2FixtureDef()),
						(h.shape = j),
						(h.friction = 0.7),
						(h.restitution = 0),
						(h.density = 0),
						(h.userData = "door-" + f),
						(h.isSensor = !0),
						(this.data = { char: f }),
						(g = this.body.data.CreateFixture(h)),
						(g.id = this.body.world.getNextFixtureId()),
						this.body.setFixtureContactCallback(
							g,
							(function (a) {
								return function (b, c, d, e, f, g) {
									if (null != c.sprite.character && c.sprite.character.data.char === a.data.char) return f ? (a.isOpen = !0) : (a.isOpen = !1);
								};
							})(this),
							this
						),
						(this.currentFrac = this.sprite.animations.currentFrame.index),
						this
					);
				}
				return (
					b(d, c),
					(d.prototype.options = { width: 64, height: 8 }),
					(d.prototype.update = function () {
						var a, b, c;
						return (
							(a = this.sprite.animations._outputFrames.indexOf(this.sprite.animations.currentFrame.index)),
							21 === a ? (this.isUp = !0) : (this.isUp = !1),
							(b = Math.min(0.04, this.game.time.elapsed / 1e3)),
							(c = 25 * b),
							this.isOpen
								? (a < 21 &&
									  ((this.currentFrac += c), (this.sprite.animations.frame = Math.round(this.currentFrac)), (null != this.sound && this.sound.isPlaying) || (this.sound = this.game.level.sounds.door.playInstance())),
								  21 === a && (this.signal.dispatch(), null != this.sound && (this.sound.stopInstance(), (this.sound = null))))
								: this.isOpen ||
								  (a > 0 && ((this.currentFrac -= c), (this.sprite.animations.frame = Math.round(this.currentFrac)), (null != this.sound && this.sound.isPlaying) || (this.sound = this.game.level.sounds.door.playInstance())),
								  0 === a && (null != this.sound && (this.sound.stopInstance(), (this.sound = null)), this.signal.dispatch())),
							this.isUp
						);
					}),
					d
				);
			})(Phaser.Group));
		});
	}.call(this),
	function () {
		var a = 