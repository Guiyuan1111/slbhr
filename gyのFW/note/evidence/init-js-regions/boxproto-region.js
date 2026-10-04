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
			b = {}.hasOwnPrope