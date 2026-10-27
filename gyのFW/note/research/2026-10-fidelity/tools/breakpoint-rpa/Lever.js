define("States/Level/Devices/Lever", ["./BoxedDevice"], function (c) {
			"use strict";
			var d;
			return (d = d = (function (c) {
				function d(b, c) {
					(this.drawDarkMask = a(this.drawDarkMask, this)), (this.checkState = a(this.checkState, this)), (this.sounds = a(this.sounds, this));
					var e, f, g, h, i, j, k, l, m, n;
					return (
						d.__super__.constructor.call(this, b, c),
						(m = this.game.make.resSprite(this.options.x, this.options.y, "MechAssets", "lever_stick0000")),
						m.anchor.set(0.5),
						this.game.physics.box2d.enable(m),
						(this.body = m.body),
						(n = this.game.make.resSprite(0, 0, "MechAssets", "lever_stick_light_off0000")),
						n.anchor.set(0.5),
						m.addChild(n),
						(n.offFrameName = "lever_stick_light_off0000"),
						(n.onFrameName = "lever_stick_light_on0000"),
						this.lights.push(n),
						this.game.layers.overGround.addChild(m),
						(this.base = e = this.game.make.resSprite(this.options.x, this.options.y, "MechAssets", "lever_base0000")),
						e.anchor.set(0.5),
						(f = this.game.make.resSprite(0, 0, "MechAssets", "lever_base_light_off0000")),
						f.anchor.set(0.5),
						e.addChild(f),
						(f.offFrameName = "lever_base_light_off0000"),
						(f.onFrameName = "lever_base_light_on0000"),
						this.lights.push(f),
						this.game.layers.overGround.addChild(e),
						this.body.clearFixtures(),
						(l = new box2d.b2PolygonShape()),
						l.SetAsOrientedBox(0.15, 0.7, new box2d.b2Vec2(0, 0.55), 0),
						(i = new box2d.b2FixtureDef()),
						(i.shape = l),
						(i.friction = 0.7),
						(i.restitution = 0),
						(i.density = 1.6),
						(i.filter.categoryBits = 1),
						(i.filter.maskBits = 61695),
						(h = m.body.data.CreateFixture(i)),
						(h.id = m.body.world.getNextFixtureId()),
						(j = new box2d.b2RevoluteJointDef()),
						(k = this.body.data.GetWorldCenter()),
						(g = new box2d.b2Vec2(k.x, k.y - 0.7)),
						j.Initialize(this.body.data, this.game.level.groundBody, g),
						(j.lowerAngle = -0.2 * Math.PI),
						(j.upperAngle = 0.2 * Math.PI),
						(j.enableLimit = !0),
						(j.maxMotorTorque = 10),
						(j.motorSpeed = 0),
						(j.enableMotor = !0),
						(this.joint = this.game.physics.box2d.world.CreateJoint(j)),
						this.options.properties.startPos === -1 ? this.body.data.SetAngle(this.joint.GetLowerLimit()) : this.body.data.SetAngle(this.joint.GetUpperLimit()),
						(this.signal = new Phaser.Signal()),
						this.registerDevice(),
						this
					);
				}
				return (
					b(d, c),
					(d.prototype.options = { atlasName: null, frameName: null }),
					(d.prototype.sounds = function () {
						return "lever";
					}),
					(d.prototype.checkState = function () {
						return 0 === this.state && this.joint.GetJointAngleRadians() * this.options.properties.onis < 0
							? ((this.state = 1), this.joint.SetMotorSpeed(-4 * this.options.properties.onis), this.game.level.sounds.lever.play(), this.signal.dispatch(this))
							: 1 === this.state && this.joint.GetJointAngleRadians() * this.options.properties.onis > 0
							? ((this.state = 0), this.joint.SetMotorSpeed(4 * this.options.properties.onis), this.game.level.sounds.lever.play(), this.signal.dispatch(this))
							: void 0;
					}),
					(d.prototype.drawDarkMask = function (a) {
						var b, c, d;
						if (1 === this.state)
							return (
								(a.ctx.globalCompositeOperation = "lighter"),
								(d = { x: this.base.x + a.offset.x, y: this.base.y + a.offset.y }),
								(b = new box2d.b2Vec2(0, this.mpx(-1.1))),
								b.SelfRotateRadians(this.joint.GetJointAngleRadians()),
								b.SelfAdd(new box2d.b2Vec2(0, this.mpx(1.8))),
								(c = a.ctx.createRadialGradient(d.x + b.x, d.y + b.y, 10, d.x + b.x, d.y + b.y, 50)),
								c.addColorStop(0, "rgba(255,255,255,1)"),
								c.addColorStop(0.7, "rgba(255,255,255,0.1)"),
								c.addColorStop(1, "rgba(255,255,255,0)"),
								a.circle(d.x + b.x, d.y + b.y, 60, c)
							);
					}),
					d
				);
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
		