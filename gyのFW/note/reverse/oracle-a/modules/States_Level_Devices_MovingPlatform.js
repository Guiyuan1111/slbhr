// 模块: States/Level/Devices/MovingPlatform  (init.beautified.js L57601-L57849)
      define("States/Level/Devices/MovingPlatform", ["./Device"], function (c) {
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
            if (c.width < c.height) {
              o = c.width;
              c.width = c.height;
              c.height = o;
              c.x = c.x + c.height / 2;
              c.y = c.y + c.width / 2;
              this.shapeRotation = n = -Math.PI / 2;
            } else {
              c.x = c.x + c.width / 2;
              c.y = c.y + c.height / 2;
              this.shapeRotation = n = 0;
            }
            c.padding = {
              x: c.properties != null && c.properties.paddingX != null ? c.properties.paddingX : 0,
              y: c.properties != null && c.properties.paddingY != null ? c.properties.paddingY : 0.06
            };
            d.__super__.constructor.call(this, b, c);
            this.sprite = this.game.make.sprite(this.options.x, this.options.y, "MechAssets", "_default0000");
            this.game.physics.box2d.enable(this.sprite);
            this.game.layers.underGround.addChild(this.sprite);
            this.body = this.sprite.body;
            this.body.clearFixtures();
            this.body.data.SetAngle(this.options.rotation);
            l = new box2d.b2PolygonShape();
            l.SetAsOrientedBox(this.options.width / 2 - this.options.padding.x, this.options.height / 2 - this.options.padding.y, new box2d.b2Vec2(0, 0), n);
            h = new box2d.b2FixtureDef();
            h.shape = l;
            h.friction = 0.7;
            h.restitution = 0;
            if (this.options.properties.dtheta != null) {
              h.density = 0.5;
            } else {
              h.density = 0;
            }
            h.userData = {
              reflection: true
            };
            h.filter.categoryBits = 256;
            h.filter.maskBits = 4369;
            g = this.body.data.CreateFixture(h);
            g.id = this.body.world.getNextFixtureId();
            if (this.options.properties.dtheta != null) {
              i = new box2d.b2RevoluteJointDef();
              k = this.body.data.GetWorldCenter();
              f = new box2d.b2Vec2(k.x - (this.options.properties.offsetX || 0), k.y - (this.options.properties.offsetY || 0));
              i.Initialize(this.body.data, this.game.level.groundBody, f);
              if (this.options.properties.dtheta > 0) {
                i.lowerAngle = 0;
                i.upperAngle = Math.PI * this.options.properties.dtheta / 180;
              } else {
                i.lowerAngle = Math.PI * this.options.properties.dtheta / 180;
                i.upperAngle = 0;
              }
              i.enableLimit = true;
              i.maxMotorTorque = 200;
              i.enableMotor = true;
              this.joint = this.game.physics.box2d.world.CreateJoint(i);
            } else {
              e = new box2d.b2Vec2(this.options.properties.dx, this.options.properties.dy);
              i = new box2d.b2PrismaticJointDef();
              i.Initialize(this.body.data, this.game.level.groundBody, this.body.data.GetWorldCenter(), e);
              i.lowerTranslation = -e.Length();
              i.upperTranslation = 0;
              i.enableLimit = true;
              i.motorSpeed = 0.5;
              i.maxMotorForce = 220;
              i.enableMotor = true;
              this.joint = this.game.physics.box2d.world.CreateJoint(i);
            }
            this.state = 0;
            this.registerDevice();
            this.shapeSprite = this.game.make.group(0, 0);
            j = this.game.make.sprite(0, 0, "MechAssets", "BarCapLeft0000");
            j.anchor.set(0.5);
            this.shapeSprite.addChild(j);
            j.x = this.mpx(this.options.width / 2 - 0.5);
            j.y = this.mpx(this.options.height / 2 - 0.5);
            m = this.game.make.sprite(0, 0, "MechAssets", "BarCapRight0000");
            m.anchor.set(0.5);
            this.shapeSprite.addChild(m);
            m.x = -this.mpx(this.options.width / 2 - 0.5);
            m.y = this.mpx(this.options.height / 2 - 0.5);
            f = this.game.make.sprite(0, 0, "MechAssets", "BarCenter0000");
            f.anchor.set(0.5);
            this.shapeSprite.addChild(f);
            f.x = 0;
            f.y = 0;
            f.scale.x = (this.options.width - 2) / 3;
            this.lights[0].scale.x = (this.options.width - 1) / 3;
            this.shapeSprite.addChild(this.lights[0]);
            this.shapeSprite.rotation = n;
            this.sprite.addChild(this.shapeSprite);
            if (n === 0) {
              this.sprite.scale.x = 1.05;
              this.sprite.scale.y = 0.95;
            } else {
              this.sprite.scale.y = 1.05;
              this.sprite.scale.x = 0.95;
            }
          }
          b(d, c);
          d.prototype.options = {
            atlasName: null,
            frameName: null,
            lightAtlas: "MechAssets",
            lightFrame: "moving_platform_light",
            properties: {
              group: 0,
              dx: 4,
              dy: 0
            }
          };
          d.prototype.sounds = function () {
            return "platform";
          };
          d.prototype.update = function () {
            if (this.joint.GetJointAngleRadians != null) {
              if (this.joint.GetJointAngleRadians() < this.joint.GetLowerLimit()) {
                this.body.data.SetAngle(-this.joint.GetLowerLimit());
              }
              if (this.joint.GetJointAngleRadians() > this.joint.GetUpperLimit()) {
                this.body.data.SetAngle(-this.joint.GetUpperLimit());
              }
            }
            return d.__super__.update.apply(this, arguments);
          };
          d.prototype.updateState = function (a) {
            var b;
            this.cacheAsBitmap = true;
            b = this.joint.GetJointAngleRadians != null && this.options.properties.dtheta > 0 ? -2 : 2;
            if (this.state === 0) {
              this.joint.SetMotorSpeed(b);
              this.body.data.ApplyForce(new box2d.b2Vec2(1, 0), new box2d.b2Vec2(0, 0));
              if (this.sound != null) {
                this.sound.stopInstance();
                this.sound = null;
              }
              if (!a) {
                return this.sound = this.game.level.sounds.platform.playInstance();
              }
            } else {
              this.joint.SetMotorSpeed(-b);
              this.body.data.ApplyForce(new box2d.b2Vec2(1, 0), new box2d.b2Vec2(0, 0));
              if (this.sound != null) {
                this.sound.stopInstance();
                this.sound = null;
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
                if (a.joint.GetJointTranslation != null) {
                  return a.joint.GetJointTranslation();
                } else if (a.options.properties.dtheta > 0) {
                  return -a.joint.GetJointAngleRadians();
                } else {
                  return a.joint.GetJointAngleRadians();
                }
              };
            }(this);
            c = function (a) {
              return function () {
                if (a.joint.GetJointTranslation != null) {
                  return a.joint.m_upperTranslation;
                } else if (a.options.properties.dtheta > 0) {
                  return -a.joint.GetLowerLimit();
                } else {
                  return a.joint.GetUpperLimit();
                }
              };
            }(this);
            b = function (a) {
              return function () {
                if (a.joint.GetJointTranslation != null) {
                  return a.joint.m_lowerTranslation;
                } else if (a.options.properties.dtheta > 0) {
                  return -a.joint.GetUpperLimit();
                } else {
                  return a.joint.GetLowerLimit();
                }
              };
            }(this);
            if (this.sound != null && this.state === 0 && a() >= c()) {
              this.sound.stopInstance();
              return this.sound = null;
            } else if (this.sound != null && this.state === 1 && a() <= b()) {
              this.sound.stopInstance();
              return this.sound = null;
            } else {
              return undefined;
            }
          };
          d.prototype.drawDarkMask = function (a) {
            var b;
            var c;
            var d;
            var e;
            if (this.state === 1) {
              a.ctx.globalCompositeOperation = "lighter";
              e = {
                x: this.sprite.x + a.offset.x,
                y: this.sprite.y + a.offset.y
              };
              b = new box2d.b2Vec2(36, 0).SelfRotateRadians(this.shapeRotation);
              c = new box2d.b2Vec2(-36, 0).SelfRotateRadians(this.shapeRotation);
              d = a.ctx.createRadialGradient(e.x + b.x, e.y + b.y, 20, e.x + b.x, e.y + b.y, 160);
              d.addColorStop(0, "rgba(255,255,255,0.9)");
              d.addColorStop(0.5, "rgba(255,255,255,0.2)");
              d.addColorStop(1, "transparent");
              a.circle(e.x + b.x, e.y + b.y, 160, d);
              d = a.ctx.createRadialGradient(e.x + c.x, e.y + c.y, 20, e.x + c.x, e.y + c.y, 160);
              d.addColorStop(0, "rgba(255,255,255,0.9)");
              d.addColorStop(0.5, "rgba(255,255,255,0.2)");
              d.addColorStop(1, "transparent");
              return a.circle(e.x + c.x, e.y + c.y, 180, d);
            }
          };
          return d;
        }(c);
      });