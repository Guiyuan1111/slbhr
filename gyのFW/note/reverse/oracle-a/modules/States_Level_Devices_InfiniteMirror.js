// 模块: States/Level/Devices/InfiniteMirror  (init.beautified.js L56693-L56782)
      define("States/Level/Devices/InfiniteMirror", ["./BoxedDevice"], function (c) {
        "use strict";

        var d;
        return d = d = function (c) {
          function d(b, c) {
            this.updateState = a(this.updateState, this);
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
            f = this.game.make.sprite(this.options.x, this.options.y, "MechAssets", "rotmirror_circle0000");
            f.anchor.set(0.5);
            this.game.layers.underGround.addChild(f);
            k = this.game.make.sprite(this.options.x, this.options.y, "MechAssets", "infinitemirror0000");
            k.anchor.set(0.5);
            this.game.physics.box2d.enable(k);
            this.body = k.body;
            l = this.game.make.sprite(0, 0, "MechAssets", "infinitemirror_light_off0000");
            l.anchor.set(0.5);
            k.addChild(l);
            l.offFrameName = "infinitemirror_light_off0000";
            l.onFrameName = "infinitemirror_light_off0000";
            this.lights.push(l);
            this.game.layers.overGround.addChild(k);
            this.body.clearFixtures();
            o = new box2d.b2PolygonShape();
            o.SetAsOrientedBox(this.options.boxWidth / 2, this.options.boxHeight / 2, new box2d.b2Vec2(0, 0), 0);
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
            this.body.data.SetAngle(this.options.rotation);
            e = new box2d.b2CircleShape(0.3);
            e.m_p = new box2d.b2Vec2(1.1, 1.1);
            i = new box2d.b2FixtureDef();
            i.shape = e;
            h = this.body.data.CreateFixture(i);
            e = new box2d.b2CircleShape(0.3);
            e.m_p = new box2d.b2Vec2(-1.1, -1.1);
            i = new box2d.b2FixtureDef();
            i.shape = e;
            h = this.body.data.CreateFixture(i);
            j = new box2d.b2RevoluteJointDef();
            n = this.body.data.GetWorldCenter();
            g = new box2d.b2Vec2(n.x, n.y);
            j.Initialize(this.body.data, this.game.level.groundBody, g);
            j.enableLimit = true;
            j.maxMotorTorque = 500;
            j.motorSpeed = 0;
            j.enableMotor = true;
            this.joint = this.game.physics.box2d.world.CreateJoint(j);
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
            mirrorWidth: 3,
            mirrorHeight: 0.1
          };
          d.prototype.updateState = function () {
            return this.joint.SetLimits(this.state, this.state);
          };
          return d;
        }(c);
      });