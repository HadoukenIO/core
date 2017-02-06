/*
Copyright 2017 OpenFin Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
var PI_M2 = Math.PI * 2.0;
//var PI_D2 = Math.PI / 2.0;

// T is percentage  between 0.0 and 1.0
var Tweens = {
    linear: function(t, b, c, d) {
        return d === 0 ? c + b : t * (c / d) + b;
    },
    'ease-out': function(t, b, c, d) {
        return d === 0 ? c + b : c * Math.sin(t / d * (Math.PI / 2)) + b;
    },
    'ease-in': function(t, b, c, d) {
        return d === 0 ? b + c : -c * Math.cos(t / d * (Math.PI / 2)) + c + b;
    },
    'ease-in-out': function(t, b, c, d) {
        return d === 0 ? b + c : -c / 2 * (Math.cos(Math.PI * t / d) - 1) + b;
    },
    'ease-in-quad': function(t, b, c, d) {
        t = d === 0 ? 1 : t / d;
        return c * t * t + b;
    },
    'ease-out-quad': function(t, b, c, d) {
        t = d === 0 ? 1 : t / d;
        return -c * t * (t - 2) + b;
    },
    'ease-in-out-quad': function(t, b, c, d) {
        t = d === 0 ? 2 : t / (d / 2);
        if (t < 1) {
            return c / 2 * t * t + b;
        }
        t--;
        return -c / 2 * (t * (t - 2) - 1) + b;
    },
    'ease-in-cubic': function(t, b, c, d) {
        t = t === 0 ? 1 : t / d;
        return c * t * t * t + b;
    },
    'ease-out-cubic': function(t, b, c, d) {
        t = t === 0 ? 1 : t / d;
        t--;
        return c * (t * t * t + 1) + b;
    },
    'ease-in-out-cubic': function(t, b, c, d) {
        t = d === 0 ? 2 : t / (d / 2);
        if (t < 1) {
            return c / 2 * t * t * t + b;
        }
        t -= 2;
        return c / 2 * (t * t * t + 2) + b;
    },
    'ease-out-bounce': function(t, b, c, d) {
        if (d === 0) {
            t = d = 1;
        }
        if ((t /= d) < (1 / 2.75)) {

            return c * (7.5625 * t * t) + b;
        } else if (t < (2 / 2.75)) {

            return c * (7.5625 * (t -= (1.5 / 2.75)) * t + 0.75) + b;
        } else if (t < (2.5 / 2.75)) {

            return c * (7.5625 * (t -= (2.25 / 2.75)) * t + 0.9375) + b;
        } else {

            return c * (7.5625 * (t -= (2.625 / 2.75)) * t + 0.984375) + b;
        }
    },
    'ease-out-back': function(t, b, c, d, s) {
        if (s === undefined) {
            s = 1.70158;
        }
        return c * ((t = t / d - 1) * t * ((s + 1) * t + s) + 1) + b;
    },
    'ease-in-back': function(t, b, c, d, s) {
        if (d === 0) {
            t = d = 1;
        }
        if (s === undefined) {
            s = 1.70158;
        }
        return c * (t /= d) * t * ((s + 1) * t - s) + b;
    },
    'ease-in-out-back': function(t, b, c, d, s) {
        if (s === undefined) {
            s = 1.70158;
        }
        if (d === 0) {
            t = d = 1;
        }

        if ((t /= d / 2) < 1) {
            return c / 2 * (t * t * (((s *= (1.525)) + 1) * t - s)) + b;
        }

        return c / 2 * ((t -= 2) * t * (((s *= (1.525)) + 1) * t + s) + 2) + b;
    },
    'ease-out-elastic': function(t, b, c, d, a, p) {
        var s;
        if (t === 0) {
            return b;
        }
        if (d === 0) {
            t = d = 1;
        }
        if ((t /= d) === 1) {
            return b + c;
        }
        if (!p) {
            p = d * 0.3;
        }
        if (!a || a < Math.abs(c)) {
            a = c;
            s = p / 4;
        } else {
            s = p / PI_M2 * Math.asin(c / a);
        }
        return (a * Math.pow(2, -10 * t) * Math.sin((t * d - s) * PI_M2 / p) + c + b);
    },
    'ease-in-elastic': function(t, b, c, d, a, p) {
        var s;
        if (t === 0) {
            return b;
        }
        if (d === 0) {
            t = d = 1;
        }
        if ((t /= d) === 1) {
            return b + c;
        }
        if (!p) {
            p = d * 0.3;
        }
        if (!a || a < Math.abs(c)) {
            a = c;
            s = p / 4;
        } else {
            s = p / PI_M2 * Math.asin(c / a);
        }
        return -(a * Math.pow(2, 10 * (t -= 1)) * Math.sin((t * d - s) * PI_M2 / p)) + b;
    },
    'ease-in-out-elastic': function(t, b, c, d, a, p) {
        var s;
        if (t === 0) {
            return b;
        }
        if (d === 0) {
            t = d = 1;
        }
        if ((t /= d / 2) === 2) {
            return b + c;
        }
        if (!p) {
            p = d * (0.3 * 1.5);
        }
        if (!a || a < Math.abs(c)) {
            a = c;
            s = p / 4;
        } else {
            s = p / PI_M2 * Math.asin(c / a);
        }
        if (t < 1) {
            return -0.5 * (a * Math.pow(2, 10 * (t -= 1)) * Math.sin((t * d - s) * PI_M2 / p)) + b;
        }
        return a * Math.pow(2, -10 * (t -= 1)) * Math.sin((t * d - s) * PI_M2 / p) * 0.5 + c + b;
    }
};

module.exports = Tweens;
