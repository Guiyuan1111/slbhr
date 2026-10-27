define("States/Level/Devices/MovingPlatform", ["./Device"], function (c) {
			"use strict";
			var d;
			return (d = d = (function (c) {
				function d(b, c) {
					(this.drawDarkMask = a(this.drawDarkMask, this)), (this.checkState = a(this.checkState, this)), (this.updateState = a(this.updateState, this)), (this.update = a(this.update, this)), (this.sounds = a(this.sounds, this));
					var e, f, g, h, i, j, k, l, m, n, o;
					c.width < c.height
						? ((o = c.width), (c.width = c.height), (c.height = o), (c.x = c.x + c.height / 2), (c.y = c.y + c.width / 2), (this.shapeRotation = n = -Math.PI / 2))
						: ((c.x = c.x + c.width / 2), (c.y = c.y + c.height / 2), (this.shapeRotation = n = 0)),
						(c.padding = { x: null != c.properties && null != c.properties.paddingX ? c.properties.paddingX : 0, y: null != c.properties && null != c.properties.paddingY ? c.properties.paddingY : 0.06 }),
						d.__super__.constructor.call(this, b, c),
						(this.sprite = this.game.make.sprite(this.options.x, this.options.y, "MechAssets", "_default0000")),
						this.game.physics.box2d.enable(this.sprite),
						this.game.layers.underGround.addChild(this.sprite),
						(this.body = this.sprite.body),
						this.body.clearFixtures(),
						this.body.data.SetAngle(this.options.rotation),
						(l = new box2d.b2PolygonShape()),
						l.SetAsOrientedBox(this.options.width / 2 - this.options.padding.x, this.options.height / 2 - this.options.padding.y, new box2d.b2Vec2(0, 0), n),
						(h = new box2d.b2FixtureDef()),
						(h.shape = l),
						(h.friction = 0.7),
						(h.restitution = 0),
						null != this.options.properties.dtheta ? (h.density = 0.5) : (h.density = 0),
						(h.userData = { reflection: !0 }),
						(h.filter.categoryBits = 256),
						(h.filter.maskBits = 4369),
						(g = this.body.data.CreateFixture(h)),
						(g.id = this.body.world.getNextFixtureId()),
						null != this.options.properties.dtheta
							? ((i = new box2d.b2RevoluteJointDef()),
							  (k = this.body.data.GetWorldCenter()),
							  (f = new box2d.b2Vec2(k.x - (this.options.properties.offsetX || 0), k.y - (this.options.properties.offsetY || 0))),
							  i.Initialize(this.body.data, this.game.level.groundBody, f),
							  this.options.properties.dtheta > 0
								  ? ((i.lowerAngle = 0), (i.upperAngle = (Math.PI * this.options.properties.dtheta) / 180))
								  : ((i.lowerAngle = (Math.PI * this.options.properties.dtheta) / 180), (i.upperAngle = 0)),
							  (i.enableLimit = !0),
							  (i.maxMotorTorque = 200),
							  (i.enableMotor = !0),
							  (this.joint = this.game.physics.box2d.world.CreateJoint(i)))
							: ((e = new box2d.b2Vec2(this.options.properties.dx, this.options.properties.dy)),
							  (i = new box2d.b2PrismaticJointDef()),
							  i.Initialize(this.body.data, this.game.level.groundBody, this.body.data.GetWorldCenter(), e),
							  (i.lowerTranslation = -e.Length()),
							  (i.upperTranslation = 0),
							  (i.enableLimit = !0),
							  (i.motorSpeed = 0.5),
							  (i.maxMotorForce = 220),
							  (i.enableMotor = !0),
							  (this.joint = this.game.physics.box2d.world.CreateJoint(i))),
						(this.state = 0),
						this.registerDevice(),
						(this.shapeSprite = this.game.make.group(0, 0)),
						(j = this.game.make.sprite(0, 0, "MechAssets", "BarCapLeft0000")),
						j.anchor.set(0.5),
						this.shapeSprite.addChild(j),
						(j.x = this.mpx(this.options.width / 2 - 0.5)),
						(j.y = this.mpx(this.options.height / 2 - 0.5)),
						(m = this.game.make.sprite(0, 0, "MechAssets", "BarCapRight0000")),
						m.anchor.set(0.5),
						this.shapeSprite.addChild(m),
						(m.x = -this.mpx(this.options.width / 2 - 0.5)),
						(m.y = this.mpx(this.options.height / 2 - 0.5)),
						(f = this.game.make.sprite(0, 0, "MechAssets", "BarCenter0000")),
						f.anchor.set(0.5),
						this.shapeSprite.addChild(f),
						(f.x = 0),
						(f.y = 0),
						(f.scale.x = (this.options.width - 2) / 3),
						(this.lights[0].scale.x = (this.options.width - 1) / 3),
						this.shapeSprite.addChild(this.lights[0]),
						(this.shapeSprite.rotation = n),
						this.sprite.addChild(this.shapeSprite),
						0 === n ? ((this.sprite.scale.x = 1.05), (this.sprite.scale.y = 0.95)) : ((this.sprite.scale.y = 1.05), (this.sprite.scale.x = 0.95));
				}
				return (
					b(d, c),
					(d.prototype.options = { atlasName: null, frameName: null, lightAtlas: "MechAssets", lightFrame: "moving_platform_light", properties: { group: 0, dx: 4, dy: 0 } }),
					(d.prototype.sounds = function () {
						return "platform";
					}),
					(d.prototype.update = function () {
						return (
							null != this.joint.GetJointAngleRadians &&
								(this.joint.GetJointAngleRadians() < this.joint.GetLowerLimit() && this.body.data.SetAngle(-this.joint.GetLowerLimit()),
								this.joint.GetJointAngleRadians() > this.joint.GetUpperLimit() && this.body.data.SetAngle(-this.joint.GetUpperLimit())),
							d.__super__.update.apply(this, arguments)
						);
					}),
					(d.prototype.updateState = function (a) {
						var b;
						if (((this.cacheAsBitmap = !0), (b = null != this.joint.GetJointAngleRadians && this.options.properties.dtheta > 0 ? -2 : 2), 0 === this.state)) {
							if ((this.joint.SetMotorSpeed(b), this.body.data.ApplyForce(new box2d.b2Vec2(1, 0), new box2d.b2Vec2(0, 0)), null != this.sound && (this.sound.stopInstance(), (this.sound = null)), !a))
								return (this.sound = this.game.level.sounds.platform.playInstance());
						} else if ((this.joint.SetMotorSpeed(-b), this.body.data.ApplyForce(new box2d.b2Vec2(1, 0), new box2d.b2Vec2(0, 0)), null != this.sound && (this.sound.stopInstance(), (this.sound = null)), !a))
							return (this.sound = this.game.level.sounds.platform.playInstance());
					}),
					(d.prototype.checkState = function () {
						var a, b, c;
						return (
							(a = (function (a) {
								return function () {
									return null != a.joint.GetJointTranslation ? a.joint.GetJointTranslation() : a.options.properties.dtheta > 0 ? -a.joint.GetJointAngleRadians() : a.joint.GetJointAngleRadians();
								};
							})(this)),
							(c = (function (a) {
								return function () {
									return null != a.joint.GetJointTranslation ? a.joint.m_upperTranslation : a.options.properties.dtheta > 0 ? -a.joint.GetLowerLimit() : a.joint.GetUpperLimit();
								};
							})(this)),
							(b = (function (a) {
								return function () {
									return null != a.joint.GetJointTranslation ? a.joint.m_lowerTranslation : a.options.properties.dtheta > 0 ? -a.joint.GetUpperLimit() : a.joint.GetLowerLimit();
								};
							})(this)),
							null != this.sound && 0 === this.state && a() >= c()
								? (this.sound.stopInstance(), (this.sound = null))
								: null != this.sound && 1 === this.state && a() <= b()
								? (this.sound.stopInstance(), (this.sound = null))
								: void 0
						);
					}),
					(d.prototype.drawDarkMask = function (a) {
						var b, c, d, e;
						if (1 === this.state)
							return (
								(a.ctx.globalCompositeOperation = "lighter"),
								(e = { x: this.sprite.x + a.offset.x, y: this.sprite.y + a.offset.y }),
								(b = new box2d.b2Vec2(36, 0).SelfRotateRadians(this.shapeRotation)),
								(c = new box2d.b2Vec2(-36, 0).SelfRotateRadians(this.shapeRotation)),
								(d = a.ctx.createRadialGradient(e.x + b.x, e.y + b.y, 20, e.x + b.x, e.y + b.y, 160)),
								d.addColorStop(0, "rgba(255,255,255,0.9)"),
								d.addColorStop(0.5, "rgba(255,255,255,0.2)"),
								d.addColorStop(1, "transparent"),
								a.circle(e.x + b.x, e.y + b.y, 160, d),
								(d = a.ctx.createRadialGradient(e.x + c.x, e.y + c.y, 20, e.x + c.x, e.y + c.y, 160)),
								d.addColorStop(0, "rgba(255,255,255,0.9)"),
								d.addColorStop(0.5, "rgba(255,255,255,0.2)"),
								d.addColorStop(1, "transparent"),
								a.circle(e.x + c.x, e.y + c.y, 180, d)
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
		