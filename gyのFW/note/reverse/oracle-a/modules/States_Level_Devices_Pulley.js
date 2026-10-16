// 模块: States/Level/Devices/Pulley  (init.beautified.js L58312-L58489)
      define("States/Level/Devices/Pulley", ["./Device"], function (c) {
        "use strict";

        var d;
        return d = d = function (c) {
          function d(b, c) {
            this.update = a(this.update, this);
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
            var p;
            var q;
            var r;
            var s;
            var t;
            var u;
            d.__super__.constructor.call(this, b, c);
            this.barWidth = this.options.properties.barWidth || this.options.barWidth;
            this.anchor1 = new box2d.b2Vec2(this.options.polyline[1][0] + this.options.x, this.options.polyline[1][1] + this.options.y - this.mpx(2));
            this.anchor2 = new box2d.b2Vec2(this.options.polyline[2][0] + this.options.x, this.options.polyline[2][1] + this.options.y - this.mpx(2));
            o = {
              x: this.options.polyline[0][0] + this.options.x,
              y: this.options.polyline[0][1] + this.options.y
            };
            p = {
              x: this.options.polyline[3][0] + this.options.x,
              y: this.options.polyline[3][1] + this.options.y
            };
            this.ropeLeft = this.game.make.tileSprite(o.x, o.y, 200, 20, "MechAssets", "pulley_rope0000");
            this.ropeCenter = this.game.make.tileSprite(this.anchor1.x, this.anchor1.y, 200, 20, "MechAssets", "pulley_rope0000");
            this.ropeRight = this.game.make.tileSprite(p.x, p.y, 200, 20, "MechAssets", "pulley_rope0000");
            this.ropeLeft.anchor.set(0, 0.5);
            this.ropeCenter.anchor.set(0, 0.5);
            this.ropeRight.anchor.set(0, 0.5);
            this.game.layers.underGround.addChild(this.ropeLeft);
            this.game.layers.underGround.addChild(this.ropeCenter);
            this.game.layers.underGround.addChild(this.ropeRight);
            this.platform1 = q = this.game.make.sprite(o.x, o.y, "MechAssets", "_default0000");
            this.platform2 = r = this.game.make.sprite(p.x, p.y, "MechAssets", "_default0000");
            this.game.physics.box2d.enable(q);
            this.game.physics.box2d.enable(r);
            this.plat1 = this.game.make.sprite(0, 0, "MechAssets", "pulley_platform0000");
            this.plat2 = this.game.make.sprite(0, 0, "MechAssets", "pulley_platform0000");
            this.plat1.anchor.set(0.5);
            this.plat2.anchor.set(0.5);
            this.plat1.width = this.mpx(this.barWidth) * 1.3;
            this.plat2.width = this.mpx(this.barWidth) * 1.3;
            this.base1 = this.game.make.sprite(0, 0, "MechAssets", "pulley_base0000");
            this.base2 = this.game.make.sprite(0, 0, "MechAssets", "pulley_base0000");
            this.base1.anchor.set(0.5);
            this.base2.anchor.set(0.5);
            this.platform1.addChild(this.base1);
            this.platform2.addChild(this.base2);
            this.platform1.addChild(this.plat1);
            this.platform2.addChild(this.plat2);
            this.game.layers.underGround.addChild(this.platform1);
            this.game.layers.underGround.addChild(this.platform2);
            q.body.data.SetFixedRotation(true);
            r.body.data.SetFixedRotation(true);
            q.body.data.m_userData = "reactable";
            r.body.data.m_userData = "reactable";
            q.body.data.SetLinearDamping(0.1);
            r.body.data.SetLinearDamping(0.1);
            t = [this.platform1.body, this.platform2.body];
            l = 0;
            n = t.length;
            for (; l < n; l++) {
              g = t[l];
              g.clearFixtures();
              j = this.barWidth / 2;
              k = j + 0.1;
              u = [];
              u.push(new box2d.b2Vec2(j, 0.12));
              u.push(new box2d.b2Vec2(-j, 0.12));
              u.push(new box2d.b2Vec2(-k, 0));
              u.push(new box2d.b2Vec2(-j, -0.12));
              u.push(new box2d.b2Vec2(j, -0.12));
              u.push(new box2d.b2Vec2(k, 0));
              s = new box2d.b2PolygonShape();
              s.Set(u);
              i = new box2d.b2FixtureDef();
              i.shape = s;
              i.friction = 0.4;
              i.restitution = 0;
              i.density = 3;
              h = g.data.CreateFixture(i);
              h.id = g.world.getNextFixtureId();
            }
            this.wheel1 = this.game.make.sprite(this.anchor1.x + 10, this.anchor1.y + 10 - this.baseHeight, "MechAssets", "pulley_anchor0000");
            this.wheel2 = this.game.make.sprite(this.anchor2.x - 10, this.anchor2.y + 10 - this.baseHeight, "MechAssets", "pulley_anchor0000");
            this.wheel1.anchor.set(0.5);
            this.wheel2.anchor.set(0.5);
            this.game.layers.underGround.addChild(this.wheel1);
            this.game.layers.underGround.addChild(this.wheel2);
            m = new box2d.b2PulleyJointDef();
            e = {
              x: this.pxm(this.anchor1.x),
              y: this.pxm(this.anchor1.y)
            };
            f = {
              x: this.pxm(this.anchor2.x),
              y: this.pxm(this.anchor2.y)
            };
            m.Initialize(q.body.data, r.body.data, e, f, q.body.data.GetWorldCenter(), r.body.data.GetWorldCenter(), 1);
            this.joint = this.game.physics.box2d.world.CreateJoint(m);
            return this;
          }
          b(d, c);
          d.prototype.options = {
            barWidth: 2.7
          };
          d.prototype.lastp1 = {
            x: 0,
            y: 0
          };
          d.prototype.baseHeight = 60;
          d.prototype.update = function () {
            var a;
            var b;
            var c;
            var d;
            var e;
            var f;
            var g;
            f = new box2d.b2Vec2(this.platform1.position.x, this.platform1.position.y - this.baseHeight);
            a = new box2d.b2Vec2(this.anchor1.x, this.anchor1.y - this.baseHeight);
            g = new box2d.b2Vec2(this.platform2.position.x, this.platform2.position.y - this.baseHeight);
            b = new box2d.b2Vec2(this.anchor2.x, this.anchor2.y - this.baseHeight);
            if (Math.round(this.lastp1.x * 1) !== Math.round(f.x * 1) || Math.round(this.lastp1.y * 1) !== Math.round(f.y * 1) || Math.round(this.lastp2.x * 1) !== Math.round(g.x * 1) || Math.round(this.lastp2.y * 1) !== Math.round(g.y * 1)) {
              this.cacheAsBitmap = false;
              this.lastp1 = f.Clone();
              this.lastp2 = g.Clone();
              d = f.Clone().SelfSub(a);
              c = a.Clone().SelfSub(b);
              e = b.Clone().SelfSub(g);
              this.ropeLeft.position = {
                x: a.x,
                y: a.y
              };
              this.ropeLeft.width = d.Length();
              this.ropeLeft.height = 20;
              this.ropeLeft.rotation = Math.atan2(-d.y, -d.x) + Math.PI;
              this.ropeLeft.tilePosition.x = d.Length();
              this.ropeCenter.position = {
                x: a.x,
                y: a.y
              };
              this.ropeCenter.width = c.Length();
              this.ropeCenter.height = 20;
              this.ropeCenter.rotation = Math.atan2(-c.y, -c.x);
              this.ropeCenter.tilePosition.x = e.Length();
              this.ropeRight.position = {
                x: b.x,
                y: b.y
              };
              this.ropeRight.width = e.Length();
              this.ropeRight.height = 20;
              this.ropeRight.rotation = Math.atan2(-e.y, -e.x);
              this.ropeRight.tilePosition.x = e.Length();
              this.wheel1.rotation = e.Length() / Math.PI / 10;
              return this.wheel2.rotation = e.Length() / Math.PI / 10;
            } else if (this.cacheAsBitmap) {
              return undefined;
            } else {
              return this.cacheAsBitmap = true;
            }
          };
          return d;
        }(c);
      });