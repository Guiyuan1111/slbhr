// 模块: States/Level/Devices/RotMirror  (init.beautified.js L58756-L58963)
      define("States/Level/Devices/RotMirror", ["./BoxedDevice"], function (c) {
        "use strict";

        var d;
        return d = d = function (c) {
          function d(b, c) {
            this.drawDarkMask = a(this.drawDarkMask, this);
            this.checkState = a(this.checkState, this);
            this.updateState = a(this.updateState, this);
            this.update = a(this.update, this);
            this.sounds = a(this.sounds, this);
            var e;
            var f;
            var g;
            var h;
            var i;
            var j;
            var k;
            var l;
            var m;
            var n;
            var o;
            d.__super__.constructor.call(this, b, c);
            this.base = f = this.game.make.resSprite(this.options.x, this.options.y, "MechAssets", "rotmirror_circle0000");
            f.anchor.set(0.5);
            this.game.layers.underGround.addChild(f);
            k = this.game.make.resSprite(this.options.x, this.options.y, "MechAssets", "rotmirror0000");
            k.anchor.set(0.5);
            this.game.physics.box2d.enable(k);
            this.body = k.body;
            l = this.game.make.resSprite(0, 0, "MechAssets", "rotmirror_light_off0000");
            l.anchor.set(0.5);
            k.addChild(l);
            l.offFrameName = "rotmirror_light_off0000";
            l.onFrameName = "rotmirror_light_on0000";
            this.lights.push(l);
            if (this.options.properties.bringToBack) {
              this.game.layers.underGround.addChild(k);
            } else {
              this.game.layers.overGround.addChild(k);
            }
            this.body.clearFixtures();
            o = new box2d.b2PolygonShape();
            o.SetAsOrientedBox(this.options.boxWidth / 2, this.options.boxHeight / 2, new box2d.b2Vec2(0, 0), 0);
            i = new box2d.b2FixtureDef();
            i.shape = o;
            i.friction = 0.7;
            i.restitution = 0;
            i.density = 1;
            i.userData = {
              lightProperties: {
                type: "transparent"
              }
            };
            h = this.body.data.CreateFixture(i);
            h.id = this.body.world.getNextFixtureId();
            m = new box2d.b2PolygonShape();
            m.SetAsOrientedBox(this.options.mirrorWidth / 2, this.options.mirrorHeight / 2, new box2d.b2Vec2(0, 0), Math.PI / 4);
            i = new box2d.b2FixtureDef();
            i.shape = m;
            i.friction = 0.7;
            i.restitution = 0;
            i.density = 0.2;
            i.userData = {
              lightProperties: {
                type: "mirror"
              }
            };
            h = this.body.data.CreateFixture(i);
            h.id = this.body.world.getNextFixtureId();
            e = new box2d.b2CircleShape(0.25);
            e.m_p = new box2d.b2Vec2(this.options.boxWidth / 2 - 0.25, this.options.boxWidth / 2 - 0.25);
            i = new box2d.b2FixtureDef();
            i.shape = e;
            h = this.body.data.CreateFixture(i);
            e = new box2d.b2CircleShape(0.25);
            e.m_p = new box2d.b2Vec2(-this.options.boxWidth / 2 + 0.25, -this.options.boxWidth / 2 + 0.25);
            i = new box2d.b2FixtureDef();
            i.shape = e;
            h = this.body.data.CreateFixture(i);
            j = new box2d.b2RevoluteJointDef();
            n = this.body.data.GetWorldCenter();
            g = new box2d.b2Vec2(n.x, n.y);
            j.Initialize(this.body.data, this.game.level.groundBody, g);
            while (this.options.rotation < 0) {
              this.options.rotation += Math.PI * 2;
            }
            if (this.options.properties.dir === 1) {
              j.lowerAngle = -this.options.rotation;
              j.upperAngle = -this.options.rotation + Math.PI / 2;
            } else {
              j.lowerAngle = -this.options.rotation - Math.PI / 2;
              j.upperAngle = -this.options.rotation;
            }
            j.enableLimit = true;
            j.maxMotorTorque = 100;
            j.enableMotor = true;
            this.joint = this.game.physics.box2d.world.CreateJoint(j);
            if (this.options.properties.dir === 1) {
              this.body.data.SetAngle(-this.joint.GetLowerLimit());
            } else {
              this.body.data.SetAngle(-this.joint.GetUpperLimit());
            }
            this.registerDevice();
            return this;
          }
          b(d, c);
          d.prototype.options = {
            atlasName: null,
            frameName: null,
            lightAtlas: null,
            lightFrame: null,
            boxWidth: 1.8,
            boxHeight: 1.8,
            mirrorWidth: 2,
            mirrorHeight: 0.1
          };
          d.prototype.sounds = function () {
            return ["platform"];
          };
          d.prototype.update = function () {
            if (this.joint.GetJointAngleRadians() < this.joint.GetLowerLimit()) {
              this.body.data.SetAngle(-this.joint.GetLowerLimit());
            }
            if (this.joint.GetJointAngleRadians() > this.joint.GetUpperLimit()) {
              this.body.data.SetAngle(-this.joint.GetUpperLimit());
            }
            return d.__super__.update.apply(this, arguments);
          };
          d.prototype.updateState = function (a) {
            if (this.state === 0) {
              this.joint.SetMotorSpeed(this.options.properties.dir * -1.5);
              if (this.sound != null) {
                this.sound.stopInstance();
              }
              if (!a) {
                return this.sound = this.game.level.sounds.platform.playInstance();
              }
            } else {
              this.joint.SetMotorSpeed(this.options.properties.dir * 1.5);
              if (this.sound != null) {
                this.sound.stopInstance();
              }
              if (!a) {
                return this.sound = this.game.level.sounds.platform.playInstance();
              }
            }
          };
          d.prototype.checkState = function () {
            var a;
            var b;
            var c;
            a = function (a) {
              return function () {
                if (a.options.properties.dir > 0) {
                  return -a.joint.GetJointAngleRadians();
                } else {
                  return a.joint.GetJointAngleRadians();
                }
              };
            }(this);
            c = function (a) {
              return function () {
                if (a.options.properties.dir > 0) {
                  return -a.joint.GetLowerLimit();
                } else {
                  return a.joint.GetUpperLimit();
                }
              };
            }(this);
            b = function (a) {
              return function () {
                if (a.options.properties.dir > 0) {
                  return -a.joint.GetUpperLimit();
                } else {
                  return a.joint.GetLowerLimit();
                }
              };
            }(this);
            if (this.sound != null && this.state === 0 && a() >= c()) {
              this.game.level.sounds.platform.stopInstance();
              return this.sound = null;
            } else if (this.sound != null && this.state === 1 && a() <= b()) {
              this.game.level.sounds.platform.stopInstance();
              return this.sound = null;
            } else {
              return undefined;
            }
          };
          d.prototype.drawDarkMask = function (a) {
            var b;
            var c;
            if (this.state === 1) {
              c = {
                x: this.base.x + a.offset.x,
                y: this.base.y + a.offset.y
              };
              a.ctx.globalCompositeOperation = "lighter";
              b = a.ctx.createRadialGradient(c.x, c.y, 20, c.x, c.y, 160);
              b.addColorStop(0, "rgba(255,255,255,1)");
              b.addColorStop(0.5, "rgba(255,255,255,0.3)");
              b.addColorStop(1, "transparent");
              return a.circle(c.x, c.y, 160, b);
            }
          };
          return d;
        }(c);
      });