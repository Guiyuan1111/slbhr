// 模块: utils/lang/Lang  (init.beautified.js L78016-L78030)
      define("utils/lang/Lang", ["require", "./ch"], function (b) {
        var c;
        var d;
        c = b("./ch");
        return d = d = function () {
          function b() {
            this.locale = a(this.locale, this);
          }
          b.prototype.dict = c;
          b.prototype.locale = function (a) {
            return this.dict[a] || a + "|locale";
          };
          return b;
        }();
      });