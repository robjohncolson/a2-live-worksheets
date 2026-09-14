(function (root, factory) {
  var api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.DagRenderer = api;
  }
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof self !== 'undefined'
      ? self
      : this,
  function () {
    'use strict';

    var SVG_NS = 'http://www.w3.org/2000/svg';
    var DEFAULTS = { width: 320, height: 220, padding: 24 };
    var TANGO = {
      ink: '#161616',
      border: '#6E6C62',
      muted: '#6E6C62',
      secondaryInk: '#2F5A5E'
    };

    function clamp01(value) {
      var number = Number(value);

      if (!Number.isFinite(number)) {
        return 0;
      }

      if (number <= 0) {
        return 0;
      }

      if (number >= 1) {
        return 1;
      }

      return number;
    }

    function lerp(a, b, t) {
      return a + ((b - a) * t);
    }

    function hslToHex(hue, saturation, lightness) {
      var h = hue / 360;
      var s = saturation / 100;
      var l = lightness / 100;
      var r;
      var g;
      var b;

      if (s === 0) {
        r = l;
        g = l;
        b = l;
      } else {
        var q = l < 0.5 ? l * (1 + s) : l + s - (l * s);
        var p = (2 * l) - q;

        function hueToRgb(t) {
          var value = t;

          if (value < 0) {
            value += 1;
          }

          if (value > 1) {
            value -= 1;
          }

          if (value < 1 / 6) {
            return p + ((q - p) * 6 * value);
          }

          if (value < 1 / 2) {
            return q;
          }

          if (value < 2 / 3) {
            return p + ((q - p) * (2 / 3 - value) * 6);
          }

          return p;
        }

        r = hueToRgb(h + 1 / 3);
        g = hueToRgb(h);
        b = hueToRgb(h - 1 / 3);
      }

      function toHex(channel) {
        var hex = Math.round(channel * 255).toString(16);

        return hex.length === 1 ? '0' + hex : hex;
      }

      return '#' + toHex(r) + toHex(g) + toHex(b);
    }

    function masteryColor(mastery) {
      var safeMastery = clamp01(mastery);
      var start;
      var end;
      var amount;

      if (safeMastery <= 0.5) {
        start = { h: 0, s: 65, l: 50 };
        end = { h: 45, s: 75, l: 50 };
        amount = safeMastery / 0.5;
      } else {
        start = { h: 45, s: 75, l: 50 };
        end = { h: 130, s: 55, l: 45 };
        amount = (safeMastery - 0.5) / 0.5;
      }

      return hslToHex(
        lerp(start.h, end.h, amount),
        lerp(start.s, end.s, amount),
        lerp(start.l, end.l, amount)
      );
    }

    function createSvg(name) {
      if (typeof document === 'undefined' || !document.createElementNS) {
        throw new Error('DagRenderer.render requires document.createElementNS');
      }

      return document.createElementNS(SVG_NS, name);
    }

    function setAttr(node, name, value) {
      if (value !== undefined && value !== null) {
        node.setAttribute(name, String(value));
      }
    }

    function truncateLabel(label) {
      var text = typeof label === 'string' ? label : '';

      if (text.length <= 18) {
        return text;
      }

      return text.slice(0, 18) + '…';
    }

    function averageMastery(loIds, masteryState) {
      var ids = Array.isArray(loIds) ? loIds : [];
      var total = 0;
      var i;

      if (ids.length === 0) {
        return 0.3;
      }

      for (i = 0; i < ids.length; i += 1) {
        if (masteryState && Object.prototype.hasOwnProperty.call(masteryState, ids[i])) {
          total += clamp01(masteryState[ids[i]]);
        } else {
          total += 0.3;
        }
      }

      return total / ids.length;
    }

    function scale(value, min, max) {
      return min + (clamp01(value) * (max - min));
    }

    function render(unitTopology, masteryState, options) {
      var config = options || {};
      var width = Number(config.width);
      var height = Number(config.height);
      var padding = Number(config.padding);
      var topology = unitTopology || {};
      var nodes = Array.isArray(topology.nodes) ? topology.nodes : [];
      var edges = Array.isArray(topology.edges) ? topology.edges : [];
      var crossEdges = Array.isArray(config.crossEdges) ? config.crossEdges : [];
      var xMax;
      var yMax;
      var svg;
      var nodeMap = Object.create(null);
      var renderedEdges = [];
      var i;

      width = Number.isFinite(width) ? width : DEFAULTS.width;
      height = Number.isFinite(height) ? height : DEFAULTS.height;
      padding = Number.isFinite(padding) ? padding : DEFAULTS.padding;
      xMax = Math.max(padding, width - padding - 100);
      yMax = Math.max(padding, height - padding);

      svg = createSvg('svg');
      setAttr(svg, 'width', width);
      setAttr(svg, 'height', height);
      setAttr(svg, 'viewBox', '0 0 ' + width + ' ' + height);
      setAttr(svg, 'role', 'img');
      setAttr(svg, 'aria-label', topology.title ? 'Concept graph for ' + topology.title : 'Concept graph');

      for (i = 0; i < nodes.length; i += 1) {
        var node = nodes[i];
        var loIds = Array.isArray(node && node.loIds) ? node.loIds : [];
        var mastery = averageMastery(loIds, masteryState);

        if (!node || !node.id) {
          continue;
        }

        nodeMap[node.id] = {
          node: node,
          cx: scale(node.x, padding, xMax),
          cy: scale(node.y, padding, yMax),
          radius: 12 + (2 * Math.min(loIds.length, 3)),
          mastery: mastery,
          loIds: loIds
        };
      }

      function appendEdges(list, dashed) {
        var index;

        for (index = 0; index < list.length; index += 1) {
          var edge = list[index];
          var from = edge && nodeMap[edge.from];
          var to = edge && nodeMap[edge.to];
          var line;

          if (!from || !to) {
            continue;
          }

          line = createSvg('line');
          setAttr(line, 'x1', from.cx);
          setAttr(line, 'y1', from.cy);
          setAttr(line, 'x2', to.cx);
          setAttr(line, 'y2', to.cy);
          setAttr(line, 'stroke', TANGO.border);
          setAttr(line, 'stroke-width', 1.5);
          setAttr(line, 'data-from', edge.from);
          setAttr(line, 'data-to', edge.to);

          if (dashed || edge.kind === 'handoff') {
            setAttr(line, 'stroke-dasharray', '4 3');
          }

          svg.appendChild(line);
          renderedEdges.push({ line: line, dashed: dashed || edge.kind === 'handoff' });
        }
      }

      function highlightEdges(nodeId) {
        var edgeIndex;

        for (edgeIndex = 0; edgeIndex < renderedEdges.length; edgeIndex += 1) {
          var entry = renderedEdges[edgeIndex];
          var line = entry.line;
          var connected =
            line.getAttribute('data-from') === nodeId ||
            line.getAttribute('data-to') === nodeId;

          setAttr(line, 'stroke', connected ? TANGO.secondaryInk : TANGO.border);
          setAttr(line, 'stroke-width', connected ? 2.25 : 1.5);

          if (entry.dashed) {
            setAttr(line, 'stroke-dasharray', '4 3');
          }
        }
      }

      appendEdges(edges, false);
      appendEdges(crossEdges, true);

      for (i = 0; i < nodes.length; i += 1) {
        var current = nodes[i];
        var meta = current && nodeMap[current.id];
        var group;
        var circle;
        var title;
        var text;
        var percent;

        if (!meta) {
          continue;
        }

        percent = Math.round(meta.mastery * 100);
        group = createSvg('g');
        circle = createSvg('circle');
        text = createSvg('text');
        title = createSvg('title');

        setAttr(circle, 'cx', meta.cx);
        setAttr(circle, 'cy', meta.cy);
        setAttr(circle, 'r', meta.radius);
        setAttr(circle, 'fill', masteryColor(meta.mastery));
        setAttr(circle, 'stroke', TANGO.muted);
        setAttr(circle, 'stroke-width', 1.5);
        setAttr(
          circle,
          'aria-label',
          current.label + ', mastery: ' + percent + '%, LOs: ' + meta.loIds.join(', ')
        );

        circle.style.transformOrigin = meta.cx + 'px ' + meta.cy + 'px';
        circle.style.transformBox = 'fill-box';
        circle.style.transition = 'transform 120ms ease';
        title.textContent = current.label + ' (' + percent + '%) - ' + meta.loIds.join(', ');
        circle.appendChild(title);

        circle.addEventListener('mouseenter', function (node, target) {
          return function (event) {
            target.style.transform = 'scale(1.2)';

            if (typeof config.onNodeHover === 'function') {
              config.onNodeHover(node, event);
            }
          };
        }(current, circle));

        circle.addEventListener('mouseleave', function (node, target) {
          return function (event) {
            target.style.transform = 'scale(1)';

            if (typeof config.onNodeHover === 'function') {
              config.onNodeHover(node, event);
            }
          };
        }(current, circle));

        if (typeof config.onNodeClick === 'function') {
          circle.style.cursor = 'pointer';
          circle.addEventListener('click', function (node) {
            return function () {
              highlightEdges(node.id);
              config.onNodeClick(node);
            };
          }(current));
        }

        setAttr(text, 'x', meta.cx + meta.radius + 4);
        setAttr(text, 'y', meta.cy + 4);
        setAttr(text, 'font-size', 10);
        setAttr(text, 'font-family', 'sans-serif');
        setAttr(text, 'fill', TANGO.ink);
        text.textContent = truncateLabel(current.label);

        group.appendChild(circle);
        group.appendChild(text);
        svg.appendChild(group);
      }

      return svg;
    }

    function selfTest() {
      var svg = render(
        {
          title: 'Self Test',
          nodes: [
            { id: 'A', label: 'Node A', loIds: ['LO-1'], x: 0.25, y: 0.25 },
            { id: 'B', label: 'Node B', loIds: ['LO-2'], x: 0.75, y: 0.75 }
          ],
          edges: [{ from: 'A', to: 'B', kind: 'sequence' }]
        },
        { 'LO-1': 0.3, 'LO-2': 0.7 }
      );

      return (
        svg.tagName.toLowerCase() === 'svg' &&
        svg.querySelectorAll('circle').length === 2 &&
        svg.querySelectorAll('line').length === 1
      );
    }

    return {
      render: render,
      masteryColor: masteryColor,
      _selfTest: selfTest
    };
  }
);
