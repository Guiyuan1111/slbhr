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
		