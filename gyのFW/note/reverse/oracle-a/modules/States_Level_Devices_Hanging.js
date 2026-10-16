// 模块: States/Level/Devices/Hanging  (init.beautified.js L56563-L56670)
      define("States/Level/Devices/Hanging", ["./Device"], function (c) {
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
            d.__super__.constructor.call(this, b, c);
            this.barWidth = this.options.properties.barWidth || this.options.barWidth;
            this.anchor = new box2d.b2Vec2(this.options.polyline[0][0] + this.options.x, this.options.polyline[0][1] + this.options.y);
            this.pos = {
              x: this.options.polyline[1][0] + this.options.x,
              y: this.options.polyline[1][1] + this.options.y
            };
            this.rope = this.game.make.tileSprite(this.anchor.x, this.anchor.y, this.options.polyline[0][1] - this.options.polyline[1][1], 20, "MechAssets", "pulley_rope0000");
            this.rope.anchor.set(0, 0.5);
            this.game.layers.underGround.addChild(this.rope);
            this.platform = p = this.game.make.sprite(this.pos.x, this.pos.y);
            h = this.game.make.sprite(0, 0, "MechAssets", "hanging_platform0000");
            h.anchor.set(0.5);
            h.width = this.mpx(this.barWidth) * 1.15;
            this.platform.addChild(h);
            g = this.game.make.sprite(this.anchor.x, this.anchor.y, "MechAssets", "hanging_anchor0000");
            i = this.game.make.sprite(0, 0, "MechAssets", "hanging_base0000");
            i.anchor.set(0.5);
            this.game.physics.box2d.enable(p, false);
            this.game.physics.box2d.enable(g);
            g.body.data.m_fixtureList.m_filter.categoryBits = 0;
            this.platform.addChild(i);
            this.game.layers.underGround.addChild(this.platform);
            this.game.layers.underGround.addChild(g);
            p.body.data.SetLinearDamping(0.4);
            p.body.data.SetAngularDamping(0.3);
            j = this.platform.body;
            j.clearFixtures();
            r = [];
            m = this.barWidth / 2;
            n = m + 0.1;
            r.push(new box2d.b2Vec2(m, 0.12));
            r.push(new box2d.b2Vec2(-m, 0.12));
            r.push(new box2d.b2Vec2(-n, 0));
            r.push(new box2d.b2Vec2(-m, -0.12));
            r.push(new box2d.b2Vec2(m, -0.12));
            r.push(new box2d.b2Vec2(n, 0));
            q = new box2d.b2PolygonShape();
            q.Set(r);
            l = new box2d.b2FixtureDef();
            l.shape = q;
            l.friction = 0.4;
            l.restitution = 0;
            l.density = 2.5;
            l.filter.categoryBits = 65535;
            l.filter.maskBits = 65535;
            k = j.data.CreateFixture(l);
            k.id = j.world.getNextFixtureId();
            o = new box2d.b2DistanceJointDef();
            e = {
              x: this.pxm(this.anchor.x),
              y: this.pxm(this.anchor.y)
            };
            f = {
              x: this.pxm(this.pos.x),
              y: this.pxm(this.pos.y)
            };
            o.Initialize(g.body.data, p.body.data, e, f);
            this.joint = this.game.physics.box2d.world.CreateJoint(o);
            o = new box2d.b2RevoluteJointDef();
            o.Initialize(g.body.data, p.body.data, f);
            o.lowerAngle = Math.PI * -0.85 / 2;
            o.upperAngle = Math.PI * 0.85 / 2;
            if (!this.options.properties.fullRotation) {
              o.enableLimit = true;
            }
            this.joint = this.game.physics.box2d.world.CreateJoint(o);
            o = new box2d.b2RevoluteJointDef();
            o.Initialize(g.body.data, this.game.level.groundBody, e);
            this.joint = this.game.physics.box2d.world.CreateJoint(o);
            return this;
          }
          b(d, c);
          d.prototype.options = {
            barWidth: 3.2
          };
          d.prototype.baseHeight = 60;
          d.prototype.update = function () {
            var a;
            var b;
            b = new box2d.b2Vec2(this.platform.position.x, this.platform.position.y);
            a = b.Clone().SelfSub(this.anchor);
            return this.rope.rotation = Math.atan2(-a.y, -a.x);
          };
          return d;
        }(c);
      });