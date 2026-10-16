// 模块: States/Load  (init.beautified.js L77887-L77977)
      define("States/Load", ["require", "Phaser", "ProgressModel", "States/Common/LoaderBar"], function (b) {
        var c;
        var d;
        var e;
        var f;
        e = b("Phaser");
        f = b("ProgressModel");
        d = b("States/Common/LoaderBar");
        return c = c = function (b) {
          function c() {
            return c.__super__.constructor.apply(this, arguments);
          }
          a(c, b);
          c.prototype.preload = function () {
            var a;
            var b;
            var c;
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
            console.log("Loading");
            l = new d(this.game, 0, 0);
            this.game.add.existing(l);
            this.game.load.atlasJSONArray("MenuAssets", "assets/atlasses/MenuAssets.png", "assets/atlasses/MenuAssets.json");
            this.game.load.atlasJSONArray("PopupAssets", "assets/atlasses/PopupAssets.png", "assets/atlasses/PopupAssets.json");
            this.game.load.bitmapFont("font", "assets/fonts/chinese/font.png", "assets/fonts/chinese/font.fnt");
            this.game.load.bitmapFont("fontStone", "assets/fonts/chinese/font.png", "assets/fonts/chinese/font.fnt");
            this.game.load.bitmapFont("font_large", "assets/fonts/chinese/font.png", "assets/fonts/chinese/font.fnt");
            this.game.load.bitmapFont("fontStone_large", "assets/fonts/chinese/font.png", "assets/fonts/chinese/font.fnt");
            this.game.load.atlasJSONArray("MenuBackgrounds", "assets/atlasses/MenuBackgrounds.png", "assets/atlasses/MenuBackgrounds.json");
            q = _.isArray(this.game.gameConfig.assets) ? this.game.gameConfig.assets : [this.game.gameConfig.assets];
            if (this.game.gameConfig.type === "multi") {
              this.game.load.atlasJSONArray("TempleIcons", "assets/atlasses/TempleIcons.png", "assets/atlasses/TempleIcons.json");
              f = 0;
              i = q.length;
              for (; f < i; f++) {
                a = q[f];
                m = a.charAt(0).toUpperCase() + a.slice(1);
                this.game.load.image("TempleHall" + m, "assets/images/TempleHall" + m + ".jpg");
              }
              this.game.load.image("GameName", "assets/images/GameNameElements.png");
            } else {
              a = q[0];
              m = a.charAt(0).toUpperCase() + a.slice(1);
              this.game.load.image("TempleHall", "assets/images/TempleHall" + m + ".jpg");
              this.game.load.image("GameName", "assets/images/GameName" + m + ".png");
            }
            this.game.load.atlasJSONArray("CharAssets", "assets/atlasses/CharAssets.png", "assets/atlasses/CharAssets.json");
            this.game.load.image("HallBeam", "assets/images/Beam.png");
            this.game.load.atlasJSONArray("PopupAssets", "assets/atlasses/PopupAssets.png", "assets/atlasses/PopupAssets.json");
            this.game.load.json("Ground", "assets/tilemaps/tilesets/Ground.json", null, e.Tilemap.TILED_JSON);
            this.game.load.json("Objects", "assets/tilemaps/tilesets/Objects.json", null, e.Tilemap.TILED_JSON);
            this.game.load.json("LargeObjects", "assets/tilemaps/tilesets/LargeObjects.json", null, e.Tilemap.TILED_JSON);
            this.game.load.json("Chars", "assets/tilemaps/tilesets/Chars.json", null, e.Tilemap.TILED_JSON);
            g = 0;
            j = q.length;
            for (; g < j; g++) {
              c = q[g];
              r = "assets/atlasses/Temples/" + c;
              this.game.load.atlasJSONArray("TempleAssets", r + "/TempleAssets.png", r + "/TempleAssets.json");
            }
            this.game.load.atlasJSONArray("GroundAssets", "assets/atlasses/GroundAssets.png", "assets/atlasses/GroundAssets.json");
            this.game.load.atlasJSONArray("CharAssets", "assets/atlasses/CharAssets.png", "assets/atlasses/CharAssets.json");
            this.game.load.atlasJSONArray("MechAssets", "assets/atlasses/MechAssets.png", "assets/atlasses/MechAssets.json");
            p = ["menuMusic", "levelMusic_speed", "levelMusic_dark", "levelMusicFinish_speed", "levelMusic", "levelMusicOver", "levelMusicFinish", "charToggle1", "charToggle2", "endPass", "endFail", "endDiamond", "jump_fb", "jump_wg", "waterSteps", "iceSteps_fb", "iceSteps_wg", "death", "diamond", "door", "freeze", "melt", "lever", "pusher", "platform", "wind", "portalOpen", "portalLoop", "portalClose", "portalTransport", "clock", "slider", "lightPusher"];
            n = [];
            h = 0;
            k = p.length;
            for (; h < k; h++) {
              o = p[h];
              b = o.charAt(0).toUpperCase() + o.slice(1);
              n.push(this.game.load.audio(o, "assets/audio/" + b + ".mp3"));
            }
            return n;
          };
          c.prototype.create = function () {
            return this.game.state.start("menu");
          };
          return c;
        }(e.State);
      });