// 模块: States/Level/Devices/Beamer  (init.beautified.js L55823-L56075)
      define("States/Level/Devices/Beamer", ["./BoxedDevice"], function (c) {
        "use strict";

        var d;
        return d = d = function (c) {
          function d(b, c) {
            this.drawDarkMask = a(this.drawDarkMask, this);
            this.drawBeam = a(this.drawBeam, this);
            this.update = a(this.update, this);
            this.getColor = a(this.getColor, this);
            var e;
            var f;
            var g;
            var h;
            var i;
            this.state = 1;
            d.__super__.constructor.call(this, b, c);
            this.body.mass = 0;
            i = [];
            i.push(new box2d.b2Vec2(0, -this.options.pusherWidth / 2 - 0.6));
            i.push(new box2d.b2Vec2(0, this.options.pusherWidth / 2 + 0.6));
            i.push(new box2d.b2Vec2(-this.options.pusherHeight, this.options.pusherWidth / 2));
            i.push(new box2d.b2Vec2(-this.options.pusherHeight, -this.options.pusherWidth / 2));
            h = new box2d.b2PolygonShape();
            h.Set(i);
            f = new box2d.b2FixtureDef();
            f.shape = h;
            f.friction = 0.7;
            f.restitution = 0;
            f.density = 0;
            f.filter.categoryBits = 1;
            f.filter.maskBits = 65535;
            e = this.body.data.CreateFixture(f);
            e.id = this.body.world.getNextFixtureId();
            g = this.game.make.sprite(0, 0, "MechAssets", "beamer_light_off0000");
            g.anchor.set(0.5);
            this.sprite.addChild(g);
            g.offFrameName = "beamer_light_off0000";
            g.onFrameName = "beamer_light_on0000";
            this.lights.push(g);
            this.registerDevice();
            this.graphics = this.game.make.graphics(0, 0);
            this.game.layers.lights.addChild(this.graphics);
            this.game.layers.dust.sources.push(this);
            this.graphicsColor = Phaser.Color.hexToColor(this.getColor()).color;
            return this;
          }
          b(d, c);
          d.prototype.options = {
            pusherWidth: 0.8,
            pusherHeight: 0.4,
            atlasName: "MechAssets",
            frameName: "beamer0000",
            layer: "overGround"
          };
          d.prototype.getColor = function () {
            switch (this.options.properties.color) {
              case "blue":
                return "#AAEAFF";
              case "red":
                return "#FF4D00";
              default:
                return "#ffff88";
            }
          };
          d.prototype.update = function () {
            var a;
            var b;
            var c;
            var d;
            var e;
            var f;
            var g;
            var h;
            var i;
            var j;
            var k;
            var l;
            this.dirty = false;
            if (this.state !== 1) {
              if (this.points !== null) {
                this.dirty = true;
              }
              this.points = null;
              return this.graphics.clear();
            }
            a = new box2d.b2RayCastCallback();
            a.ReportFixture = function (a, b, c, d) {
              if (a.m_userData == null || a.m_userData.lightProperties == null) {
                this.contact = {
                  point: b.Clone(),
                  normal: null
                };
                return d;
              }
              if (a.m_userData.lightProperties.type !== "transparent") {
                if (a.m_userData.lightProperties.type === "normal") {
                  this.contact = {
                    point: b.Clone(),
                    normal: null
                  };
                  if (a.m_userData.lightProperties.sensor) {
                    this.contact.sensor = a;
                  }
                  return d;
                } else if (a.m_userData.lightProperties.type === "mirror") {
                  this.contact = {
                    point: b.Clone(),
                    normal: c.Clone()
                  };
                  if (a.m_userData.lightProperties.sensor) {
                    this.contact.sensor = a;
                  }
                  return d;
                } else if (a.m_userData.lightProperties.type === "portal") {
                  if (a.m_userData.device.state === 1) {
                    this.contact = {
                      point: a.m_userData.lightProperties.getPoint(b, c),
                      output: a.m_userData.lightProperties.getOutput,
                      skipPoint: b.Clone()
                    };
                    return d;
                  } else {
                    return undefined;
                  }
                } else {
                  if (a.m_userData.lightProperties.sensor) {
                    this.contact.sensor = a;
                  }
                  return;
                }
              }
            };
            a.point = new box2d.b2Vec2(this.pxm(this.options.x), this.pxm(this.options.y));
            c = new box2d.b2Vec2(-1, 0);
            c = c.SelfRotateRadians(this.options.rotation || 0);
            a.dir = c;
            j = [];
            j.push({
              point: a.point.Clone()
            });
            while (a.dir != null && j.length < 11) {
              h = a.point.Clone();
              i = a.point.Clone().SelfAdd(a.dir.Clone().SelfMul(50));
              a.contact = null;
              this.body.world.world.RayCast(a, h, i);
              if (a.contact != null) {
                a.point = a.contact.point;
                if (a.contact.sensor != null) {
                  a.contact.sensor.m_userData.lightProperties.iluminated = this.options.properties.color;
                  a.contact.sensor.m_userData.lightProperties.lightAt = a.contact.point;
                }
                if (a.contact.skipPoint) {
                  j.push({
                    type: "line",
                    point: a.contact.skipPoint.Clone()
                  });
                  j.push({
                    type: "move",
                    point: a.point.Clone()
                  });
                } else {
                  j.push({
                    type: "line",
                    point: a.point.Clone()
                  });
                }
                if (a.contact.output != null) {
                  a.dir = a.contact.output(a.dir);
                } else if (a.contact.normal != null) {
                  b = h.Clone().SelfSub(i).SelfNormalize();
                  f = a.contact.normal.Clone().SelfCrossVS(1);
                  a.dir = b.Clone().SelfSub(f.Clone().SelfMul(b.Clone().Dot(f) * 2));
                } else {
                  a.dir = null;
                }
              }
            }
            l = [30, 10, 2];
            g = [0.05, 0.3, 1];
            if (!_.isEqual(this.points, j)) {
              this.graphics.clear();
              this.dirty = true;
              this.points = j;
              this.graphics.blendMode = PIXI.blendModes.LIGHTEN;
              k = [];
              d = e = 1;
              for (; e <= 2; d = ++e) {
                this.graphics.lineStyle(l[d], this.graphicsColor, g[d]);
                k.push(this.drawBeam(this.graphics, j));
              }
              return k;
            }
          };
          d.prototype.drawBeam = function (a, b, c) {
            var d;
            var e;
            var f;
            var g;
            var h;
            if (c == null) {
              c = {
                x: 0,
                y: 0
              };
            }
            a.moveTo(this.mpx(b[0].point.x) + c.x, this.mpx(b[0].point.y) + c.y);
            h = [];
            d = e = 0;
            f = b.length;
            for (; e < f; d = ++e) {
              g = b[d];
              if (d > 0) {
                if (g.type === "line") {
                  a.lineTo(this.mpx(g.point.x) + c.x, this.mpx(g.point.y) + c.y);
                  h.push(a.moveTo(this.mpx(g.point.x) + c.x, this.mpx(g.point.y) + c.y));
                } else if (g.type === "move") {
                  h.push(a.moveTo(this.mpx(g.point.x) + c.x, this.mpx(g.point.y) + c.y));
                } else {
                  h.push(undefined);
                }
              } else {
                h.push(undefined);
              }
            }
            return h;
          };
          d.prototype.drawDarkMask = function (a) {
            var b;
            var c;
            if (this.state === 1 && this.points != null) {
              a.ctx.globalCompositeOperation = "lighter";
              a.ctx.beginPath();
              a.ctx.lineCap = "round";
              a.ctx.strokeStyle = "rgba(255,255,255,0.8)";
              a.ctx.lineWidth = 25;
              this.drawBeam(a.ctx, this.points, a.offset);
              a.ctx.stroke();
              a.ctx.closePath();
              c = {
                x: this.sprite.x + a.offset.x,
                y: this.sprite.y + a.offset.y
              };
              b = a.ctx.createRadialGradient(c.x, c.y, 30, c.x, c.y, 90);
              b.addColorStop(0, "rgba(255,255,255,1)");
              b.addColorStop(0.5, "rgba(255,255,255,0.3)");
              b.addColorStop(1, "transparent");
              return a.circle(c.x, c.y, 90, b);
            }
          };
          return d;
        }(c);
      });