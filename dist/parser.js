'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

exports.default = function (buffers) {
  var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

  var parser = new ParserInstance(buffers, options);
  var response = {};

  response.tag = parser.getTag();
  parser.getSpace();
  response.command = parser.getCommand();

  if (['UID', 'AUTHENTICATE'].indexOf((response.command || '').toUpperCase()) >= 0) {
    parser.getSpace();
    response.command += ' ' + parser.getElement((0, _formalSyntax.COMMAND)());
  }

  if (!isEmpty(parser.remainder)) {
    parser.getSpace();
    response.attributes = parser.getAttributes();
  }

  if (parser.humanReadable) {
    response.attributes = (response.attributes || []).concat({
      type: 'TEXT',
      value: parser.humanReadable
    });
  }

  return response;
};

var _formalSyntax = require('./formal-syntax');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var ASCII_NL = 10;
var ASCII_CR = 13;
var ASCII_SPACE = 32;
var ASCII_LEFT_BRACKET = 91;
var ASCII_RIGHT_BRACKET = 93;

function fromCharCode(uint8Array) {
  var decoder = new TextDecoder();
  return decoder.decode(uint8Array);
}

function fromCharCodeTrimmed(uint8Array) {
  var begin = 0;
  var end = uint8Array.length;

  while (uint8Array[begin] === ASCII_SPACE) {
    begin++;
  }

  while (uint8Array[end - 1] === ASCII_SPACE) {
    end--;
  }

  if (begin !== 0 || end !== uint8Array.length) {
    uint8Array = uint8Array.subarray(begin, end);
  }

  return fromCharCode(uint8Array);
}

function isEmpty(uint8Array) {
  for (var i = 0; i < uint8Array.length; i++) {
    if (uint8Array[i] !== ASCII_SPACE) {
      return false;
    }
  }

  return true;
}

var ParserInstance = function () {
  function ParserInstance(input, options) {
    _classCallCheck(this, ParserInstance);

    this.remainder = new Uint8Array(input || 0);
    this.options = options || {};
    this.pos = 0;
  }

  _createClass(ParserInstance, [{
    key: 'getTag',
    value: function getTag() {
      if (!this.tag) {
        this.tag = this.getElement((0, _formalSyntax.TAG)() + '*+', true);
      }
      return this.tag;
    }
  }, {
    key: 'getCommand',
    value: function getCommand() {
      if (!this.command) {
        this.command = this.getElement((0, _formalSyntax.COMMAND)());
      }

      switch ((this.command || '').toString().toUpperCase()) {
        case 'OK':
        case 'NO':
        case 'BAD':
        case 'PREAUTH':
        case 'BYE':
          var lastRightBracket = this.remainder.lastIndexOf(ASCII_RIGHT_BRACKET);
          if (this.remainder[1] === ASCII_LEFT_BRACKET && lastRightBracket > 1) {
            this.humanReadable = fromCharCodeTrimmed(this.remainder.subarray(lastRightBracket + 1));
            this.remainder = this.remainder.subarray(0, lastRightBracket + 1);
          } else {
            this.humanReadable = fromCharCodeTrimmed(this.remainder);
            this.remainder = new Uint8Array(0);
          }
          break;
      }

      return this.command;
    }
  }, {
    key: 'getElement',
    value: function getElement(syntax) {
      var element = void 0;
      if (this.remainder[0] === ASCII_SPACE) {
        throw new Error('Unexpected whitespace at position ' + this.pos);
      }

      var firstSpace = this.remainder.indexOf(ASCII_SPACE);
      if (this.remainder.length > 0 && firstSpace !== 0) {
        if (firstSpace === -1) {
          element = fromCharCode(this.remainder);
        } else {
          element = fromCharCode(this.remainder.subarray(0, firstSpace));
        }

        var errPos = (0, _formalSyntax.verify)(element, syntax);
        if (errPos >= 0) {
          throw new Error('Unexpected char at position ' + (this.pos + errPos));
        }
      } else {
        throw new Error('Unexpected end of input at position ' + this.pos);
      }

      this.pos += element.length;
      this.remainder = this.remainder.subarray(element.length);

      return element;
    }
  }, {
    key: 'getSpace',
    value: function getSpace() {
      if (!this.remainder.length) {
        throw new Error('Unexpected end of input at position ' + this.pos);
      }

      if ((0, _formalSyntax.verify)(String.fromCharCode(this.remainder[0]), (0, _formalSyntax.SP)()) >= 0) {
        throw new Error('Unexpected char at position ' + this.pos);
      }

      this.pos++;
      this.remainder = this.remainder.subarray(1);
    }
  }, {
    key: 'getAttributes',
    value: function getAttributes() {
      if (!this.remainder.length) {
        throw new Error('Unexpected end of input at position ' + this.pos);
      }

      if (this.remainder[0] === ASCII_SPACE) {
        throw new Error('Unexpected whitespace at position ' + this.pos);
      }

      return new TokenParser(this, this.pos, this.remainder.subarray(), this.options).getAttributes();
    }
  }]);

  return ParserInstance;
}();

var Node = function () {
  function Node(uint8Array, parentNode, startPos) {
    _classCallCheck(this, Node);

    this.uint8Array = uint8Array;
    this.childNodes = [];
    this.type = false;
    this.closed = true;
    this.valueSkip = [];
    this.startPos = startPos;
    this.valueStart = this.valueEnd = typeof startPos === 'number' ? startPos + 1 : 0;

    if (parentNode) {
      this.parentNode = parentNode;
      parentNode.childNodes.push(this);
    }
  }

  _createClass(Node, [{
    key: 'getValue',
    value: function getValue() {
      var value = fromCharCode(this.getValueArray());
      return this.valueToUpperCase ? value.toUpperCase() : value;
    }
  }, {
    key: 'getValueLength',
    value: function getValueLength() {
      return this.valueEnd - this.valueStart - this.valueSkip.length;
    }
  }, {
    key: 'getValueArray',
    value: function getValueArray() {
      var valueArray = this.uint8Array.subarray(this.valueStart, this.valueEnd);

      if (this.valueSkip.length === 0) {
        return valueArray;
      }

      var filteredArray = new Uint8Array(valueArray.length - this.valueSkip.length);
      var begin = 0;
      var offset = 0;
      var skip = this.valueSkip.slice();

      skip.push(valueArray.length);

      skip.forEach(function (end) {
        if (end > begin) {
          var subArray = valueArray.subarray(begin, end);
          filteredArray.set(subArray, offset);
          offset += subArray.length;
        }
        begin = end + 1;
      });

      return filteredArray;
    }
  }, {
    key: 'equals',
    value: function equals(value, caseSensitive) {
      if (this.getValueLength() !== value.length) {
        return false;
      }

      return this.equalsAt(value, 0, caseSensitive);
    }
  }, {
    key: 'equalsAt',
    value: function equalsAt(value, index, caseSensitive) {
      caseSensitive = typeof caseSensitive === 'boolean' ? caseSensitive : true;

      if (index < 0) {
        index = this.valueEnd + index;

        while (this.valueSkip.indexOf(this.valueStart + index) >= 0) {
          index--;
        }
      } else {
        index = this.valueStart + index;
      }

      for (var i = 0; i < value.length; i++) {
        while (this.valueSkip.indexOf(index - this.valueStart) >= 0) {
          index++;
        }

        if (index >= this.valueEnd) {
          return false;
        }

        var uint8Char = String.fromCharCode(this.uint8Array[index]);
        var char = value[i];

        if (!caseSensitive) {
          uint8Char = uint8Char.toUpperCase();
          char = char.toUpperCase();
        }

        if (uint8Char !== char) {
          return false;
        }

        index++;
      }

      return true;
    }
  }, {
    key: 'isNumber',
    value: function isNumber() {
      for (var i = 0; i < this.valueEnd - this.valueStart; i++) {
        if (this.valueSkip.indexOf(i) >= 0) {
          continue;
        }

        if (!this.isDigit(i)) {
          return false;
        }
      }

      return true;
    }
  }, {
    key: 'isDigit',
    value: function isDigit(index) {
      if (index < 0) {
        index = this.valueEnd + index;

        while (this.valueSkip.indexOf(this.valueStart + index) >= 0) {
          index--;
        }
      } else {
        index = this.valueStart + index;

        while (this.valueSkip.indexOf(this.valueStart + index) >= 0) {
          index++;
        }
      }

      var ascii = this.uint8Array[index];
      return ascii >= 48 && ascii <= 57;
    }
  }, {
    key: 'containsChar',
    value: function containsChar(char) {
      var ascii = char.charCodeAt(0);

      for (var i = this.valueStart; i < this.valueEnd; i++) {
        if (this.valueSkip.indexOf(i - this.valueStart) >= 0) {
          continue;
        }

        if (this.uint8Array[i] === ascii) {
          return true;
        }
      }

      return false;
    }
  }]);

  return Node;
}();

var TokenParser = function () {
  function TokenParser(parent, startPos, uint8Array) {
    var options = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};

    _classCallCheck(this, TokenParser);

    this.uint8Array = uint8Array;
    this.options = options;
    this.parent = parent;

    this.tree = this.currentNode = this.createNode();
    this.pos = startPos || 0;

    this.currentNode.type = 'TREE';

    this.state = 'NORMAL';

    if (this.options.valueAsString === undefined) {
      this.options.valueAsString = true;
    }

    this.processString();
  }

  _createClass(TokenParser, [{
    key: 'getAttributes',
    value: function getAttributes() {
      var _this = this;

      var attributes = [];
      var branch = attributes;

      var walk = function walk(node) {
        var elm = void 0;
        var curBranch = branch;
        var partial = void 0;

        if (!node.closed && node.type === 'SEQUENCE' && node.equals('*')) {
          node.closed = true;
          node.type = 'ATOM';
        }

        // If the node was never closed, throw it
        if (!node.closed) {
          throw new Error('Unexpected end of input at position ' + (_this.pos + _this.uint8Array.length - 1));
        }

        switch (node.type.toUpperCase()) {
          case 'LITERAL':
          case 'STRING':
            elm = {
              type: node.type.toUpperCase(),
              value: _this.options.valueAsString ? node.getValue() : node.getValueArray()
            };
            branch.push(elm);
            break;
          case 'SEQUENCE':
            elm = {
              type: node.type.toUpperCase(),
              value: node.getValue()
            };
            branch.push(elm);
            break;
          case 'ATOM':
            if (node.equals('NIL', true)) {
              branch.push(null);
              break;
            }
            elm = {
              type: node.type.toUpperCase(),
              value: node.getValue()
            };
            branch.push(elm);
            break;
          case 'SECTION':
            branch = branch[branch.length - 1].section = [];
            break;
          case 'LIST':
            elm = [];
            branch.push(elm);
            branch = elm;
            break;
          case 'PARTIAL':
            partial = node.getValue().split('.').map(Number);
            branch[branch.length - 1].partial = partial;
            break;
        }

        node.childNodes.forEach(function (childNode) {
          walk(childNode);
        });
        branch = curBranch;
      };

      walk(this.tree);

      return attributes;
    }
  }, {
    key: 'createNode',
    value: function createNode(parentNode, startPos) {
      return new Node(this.uint8Array, parentNode, startPos);
    }
  }, {
    key: 'processString',
    value: function processString() {
      var _this2 = this;

      var i = void 0;
      var len = void 0;
      var checkSP = function checkSP(pos) {
        // jump to the next non whitespace pos
        while (_this2.uint8Array[i + 1] === ' ') {
          i++;
        }
      };

      for (i = 0, len = this.uint8Array.length; i < len; i++) {
        var chr = String.fromCharCode(this.uint8Array[i]);

        switch (this.state) {
          case 'NORMAL':

            switch (chr) {
              // DQUOTE starts a new string
              case '"':
                this.currentNode = this.createNode(this.currentNode, i);
                this.currentNode.type = 'string';
                this.state = 'STRING';
                this.currentNode.closed = false;
                break;

              // ( starts a new list
              case '(':
                this.currentNode = this.createNode(this.currentNode, i);
                this.currentNode.type = 'LIST';
                this.currentNode.closed = false;
                break;

              // ) closes a list
              case ')':
                if (this.currentNode.type !== 'LIST') {
                  throw new Error('Unexpected list terminator ) at position ' + (this.pos + i));
                }

                this.currentNode.closed = true;
                this.currentNode.endPos = this.pos + i;
                this.currentNode = this.currentNode.parentNode;

                checkSP();
                break;

              // ] closes section group
              case ']':
                if (this.currentNode.type !== 'SECTION') {
                  throw new Error('Unexpected section terminator ] at position ' + (this.pos + i));
                }
                this.currentNode.closed = true;
                this.currentNode.endPos = this.pos + i;
                this.currentNode = this.currentNode.parentNode;
                checkSP();
                break;

              // < starts a new partial
              case '<':
                if (String.fromCharCode(this.uint8Array[i - 1]) !== ']') {
                  this.currentNode = this.createNode(this.currentNode, i);
                  this.currentNode.type = 'ATOM';
                  this.currentNode.valueStart = i;
                  this.currentNode.valueEnd = i + 1;
                  this.state = 'ATOM';
                } else {
                  this.currentNode = this.createNode(this.currentNode, i);
                  this.currentNode.type = 'PARTIAL';
                  this.state = 'PARTIAL';
                  this.currentNode.closed = false;
                }
                break;

              // { starts a new literal
              case '{':
                this.currentNode = this.createNode(this.currentNode, i);
                this.currentNode.type = 'LITERAL';
                this.state = 'LITERAL';
                this.currentNode.closed = false;
                break;

              // ( starts a new sequence
              case '*':
                this.currentNode = this.createNode(this.currentNode, i);
                this.currentNode.type = 'SEQUENCE';
                this.currentNode.valueStart = i;
                this.currentNode.valueEnd = i + 1;
                this.currentNode.closed = false;
                this.state = 'SEQUENCE';
                break;

              // normally a space should never occur
              case ' ':
                // just ignore
                break;

              // [ starts section
              case '[':
                // If it is the *first* element after response command, then process as a response argument list
                if (['OK', 'NO', 'BAD', 'BYE', 'PREAUTH'].indexOf(this.parent.command.toUpperCase()) >= 0 && this.currentNode === this.tree) {
                  this.currentNode.endPos = this.pos + i;

                  this.currentNode = this.createNode(this.currentNode, i);
                  this.currentNode.type = 'ATOM';

                  this.currentNode = this.createNode(this.currentNode, i);
                  this.currentNode.type = 'SECTION';
                  this.currentNode.closed = false;
                  this.state = 'NORMAL';

                  // RFC2221 defines a response code REFERRAL whose payload is an
                  // RFC2192/RFC5092 imapurl that we will try to parse as an ATOM but
                  // fail quite badly at parsing.  Since the imapurl is such a unique
                  // (and crazy) term, we just specialize that case here.
                  if (fromCharCode(this.uint8Array.subarray(i + 1, i + 10)).toUpperCase() === 'REFERRAL ') {
                    // create the REFERRAL atom
                    this.currentNode = this.createNode(this.currentNode, this.pos + i + 1);
                    this.currentNode.type = 'ATOM';
                    this.currentNode.endPos = this.pos + i + 8;
                    this.currentNode.valueStart = i + 1;
                    this.currentNode.valueEnd = i + 9;
                    this.currentNode.valueToUpperCase = true;
                    this.currentNode = this.currentNode.parentNode;

                    // eat all the way through the ] to be the  IMAPURL token.
                    this.currentNode = this.createNode(this.currentNode, this.pos + i + 10);
                    // just call this an ATOM, even though IMAPURL might be more correct
                    this.currentNode.type = 'ATOM';
                    // jump i to the ']'
                    i = this.uint8Array.indexOf(ASCII_RIGHT_BRACKET, i + 10);
                    this.currentNode.endPos = this.pos + i - 1;
                    this.currentNode.valueStart = this.currentNode.startPos - this.pos;
                    this.currentNode.valueEnd = this.currentNode.endPos - this.pos + 1;
                    this.currentNode = this.currentNode.parentNode;

                    // close out the SECTION
                    this.currentNode.closed = true;
                    this.currentNode = this.currentNode.parentNode;
                    checkSP();
                  }

                  break;
                }
              /* falls through */
              default:
                // Any ATOM supported char starts a new Atom sequence, otherwise throw an error
                // Allow \ as the first char for atom to support system flags
                // Allow % to support LIST '' %
                if ((0, _formalSyntax.ATOM_CHAR)().indexOf(chr) < 0 && chr !== '\\' && chr !== '%') {
                  throw new Error('Unexpected char at position ' + (this.pos + i));
                }

                this.currentNode = this.createNode(this.currentNode, i);
                this.currentNode.type = 'ATOM';
                this.currentNode.valueStart = i;
                this.currentNode.valueEnd = i + 1;
                this.state = 'ATOM';
                break;
            }
            break;

          case 'ATOM':

            // space finishes an atom
            if (chr === ' ') {
              this.currentNode.endPos = this.pos + i - 1;
              this.currentNode = this.currentNode.parentNode;
              this.state = 'NORMAL';
              break;
            }

            //
            if (this.currentNode.parentNode && (chr === ')' && this.currentNode.parentNode.type === 'LIST' || chr === ']' && this.currentNode.parentNode.type === 'SECTION')) {
              this.currentNode.endPos = this.pos + i - 1;
              this.currentNode = this.currentNode.parentNode;

              this.currentNode.closed = true;
              this.currentNode.endPos = this.pos + i;
              this.currentNode = this.currentNode.parentNode;
              this.state = 'NORMAL';

              checkSP();
              break;
            }

            if ((chr === ',' || chr === ':') && this.currentNode.isNumber()) {
              this.currentNode.type = 'SEQUENCE';
              this.currentNode.closed = true;
              this.state = 'SEQUENCE';
            }

            // [ starts a section group for this element
            if (chr === '[' && (this.currentNode.equals('BODY', false) || this.currentNode.equals('BODY.PEEK', false))) {
              this.currentNode.endPos = this.pos + i;
              this.currentNode = this.createNode(this.currentNode.parentNode, this.pos + i);
              this.currentNode.type = 'SECTION';
              this.currentNode.closed = false;
              this.state = 'NORMAL';
              break;
            }

            if (chr === '<') {
              throw new Error('Unexpected start of partial at position ' + this.pos);
            }

            // if the char is not ATOM compatible, throw. Allow \* as an exception
            if ((0, _formalSyntax.ATOM_CHAR)().indexOf(chr) < 0 && chr !== ']' && !(chr === '*' && this.currentNode.equals('\\'))) {
              throw new Error('Unexpected char at position ' + (this.pos + i));
            } else if (this.currentNode.equals('\\*')) {
              throw new Error('Unexpected char at position ' + (this.pos + i));
            }

            this.currentNode.valueEnd = i + 1;
            break;

          case 'STRING':

            // DQUOTE ends the string sequence
            if (chr === '"') {
              this.currentNode.endPos = this.pos + i;
              this.currentNode.closed = true;
              this.currentNode = this.currentNode.parentNode;
              this.state = 'NORMAL';

              checkSP();
              break;
            }

            // \ Escapes the following char
            if (chr === '\\') {
              this.currentNode.valueSkip.push(i - this.currentNode.valueStart);
              i++;
              if (i >= len) {
                throw new Error('Unexpected end of input at position ' + (this.pos + i));
              }
              chr = String.fromCharCode(this.uint8Array[i]);
            }

            /* // skip this check, otherwise the parser might explode on binary input
            if (TEXT_CHAR().indexOf(chr) < 0) {
                throw new Error('Unexpected char at position ' + (this.pos + i));
            }
            */

            this.currentNode.valueEnd = i + 1;
            break;

          case 'PARTIAL':
            if (chr === '>') {
              if (this.currentNode.equalsAt('.', -1)) {
                throw new Error('Unexpected end of partial at position ' + this.pos);
              }
              this.currentNode.endPos = this.pos + i;
              this.currentNode.closed = true;
              this.currentNode = this.currentNode.parentNode;
              this.state = 'NORMAL';
              checkSP();
              break;
            }

            if (chr === '.' && (!this.currentNode.getValueLength() || this.currentNode.containsChar('.'))) {
              throw new Error('Unexpected partial separator . at position ' + this.pos);
            }

            if ((0, _formalSyntax.DIGIT)().indexOf(chr) < 0 && chr !== '.') {
              throw new Error('Unexpected char at position ' + (this.pos + i));
            }

            if (chr !== '.' && (this.currentNode.equals('0') || this.currentNode.equalsAt('.0', -2))) {
              throw new Error('Invalid partial at position ' + (this.pos + i));
            }

            this.currentNode.valueEnd = i + 1;
            break;

          case 'LITERAL':
            if (this.currentNode.started) {
              if (chr === '\0') {
                throw new Error('Unexpected \\x00 at position ' + (this.pos + i));
              }
              this.currentNode.valueEnd = i + 1;

              if (this.currentNode.getValueLength() >= this.currentNode.literalLength) {
                this.currentNode.endPos = this.pos + i;
                this.currentNode.closed = true;
                this.currentNode = this.currentNode.parentNode;
                this.state = 'NORMAL';
                checkSP();
              }
              break;
            }

            if (chr === '+' && this.options.literalPlus) {
              this.currentNode.literalPlus = true;
              break;
            }

            if (chr === '}') {
              if (!('literalLength' in this.currentNode)) {
                throw new Error('Unexpected literal prefix end char } at position ' + (this.pos + i));
              }
              if (this.uint8Array[i + 1] === ASCII_NL) {
                i++;
              } else if (this.uint8Array[i + 1] === ASCII_CR && this.uint8Array[i + 2] === ASCII_NL) {
                i += 2;
              } else {
                throw new Error('Unexpected char at position ' + (this.pos + i));
              }
              this.currentNode.valueStart = i + 1;
              this.currentNode.literalLength = Number(this.currentNode.literalLength);
              this.currentNode.started = true;

              if (!this.currentNode.literalLength) {
                // special case where literal content length is 0
                // close the node right away, do not wait for additional input
                this.currentNode.endPos = this.pos + i;
                this.currentNode.closed = true;
                this.currentNode = this.currentNode.parentNode;
                this.state = 'NORMAL';
                checkSP();
              }
              break;
            }
            if ((0, _formalSyntax.DIGIT)().indexOf(chr) < 0) {
              throw new Error('Unexpected char at position ' + (this.pos + i));
            }
            if (this.currentNode.literalLength === '0') {
              throw new Error('Invalid literal at position ' + (this.pos + i));
            }
            this.currentNode.literalLength = (this.currentNode.literalLength || '') + chr;
            break;

          case 'SEQUENCE':
            // space finishes the sequence set
            if (chr === ' ') {
              if (!this.currentNode.isDigit(-1) && !this.currentNode.equalsAt('*', -1)) {
                throw new Error('Unexpected whitespace at position ' + (this.pos + i));
              }

              if (this.currentNode.equalsAt('*', -1) && !this.currentNode.equalsAt(':', -2)) {
                throw new Error('Unexpected whitespace at position ' + (this.pos + i));
              }

              this.currentNode.closed = true;
              this.currentNode.endPos = this.pos + i - 1;
              this.currentNode = this.currentNode.parentNode;
              this.state = 'NORMAL';
              break;
            } else if (this.currentNode.parentNode && chr === ']' && this.currentNode.parentNode.type === 'SECTION') {
              this.currentNode.endPos = this.pos + i - 1;
              this.currentNode = this.currentNode.parentNode;

              this.currentNode.closed = true;
              this.currentNode.endPos = this.pos + i;
              this.currentNode = this.currentNode.parentNode;
              this.state = 'NORMAL';

              checkSP();
              break;
            }

            if (chr === ':') {
              if (!this.currentNode.isDigit(-1) && !this.currentNode.equalsAt('*', -1)) {
                throw new Error('Unexpected range separator : at position ' + (this.pos + i));
              }
            } else if (chr === '*') {
              if (!this.currentNode.equalsAt(',', -1) && !this.currentNode.equalsAt(':', -1)) {
                throw new Error('Unexpected range wildcard at position ' + (this.pos + i));
              }
            } else if (chr === ',') {
              if (!this.currentNode.isDigit(-1) && !this.currentNode.equalsAt('*', -1)) {
                throw new Error('Unexpected sequence separator , at position ' + (this.pos + i));
              }
              if (this.currentNode.equalsAt('*', -1) && !this.currentNode.equalsAt(':', -2)) {
                throw new Error('Unexpected sequence separator , at position ' + (this.pos + i));
              }
            } else if (!/\d/.test(chr)) {
              throw new Error('Unexpected char at position ' + (this.pos + i));
            }

            if (/\d/.test(chr) && this.currentNode.equalsAt('*', -1)) {
              throw new Error('Unexpected number at position ' + (this.pos + i));
            }

            this.currentNode.valueEnd = i + 1;
            break;
        }
      }
    }
  }]);

  return TokenParser;
}();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9wYXJzZXIuanMiXSwibmFtZXMiOlsiYnVmZmVycyIsIm9wdGlvbnMiLCJwYXJzZXIiLCJQYXJzZXJJbnN0YW5jZSIsInJlc3BvbnNlIiwidGFnIiwiZ2V0VGFnIiwiZ2V0U3BhY2UiLCJjb21tYW5kIiwiZ2V0Q29tbWFuZCIsImluZGV4T2YiLCJ0b1VwcGVyQ2FzZSIsImdldEVsZW1lbnQiLCJpc0VtcHR5IiwicmVtYWluZGVyIiwiYXR0cmlidXRlcyIsImdldEF0dHJpYnV0ZXMiLCJodW1hblJlYWRhYmxlIiwiY29uY2F0IiwidHlwZSIsInZhbHVlIiwiQVNDSUlfTkwiLCJBU0NJSV9DUiIsIkFTQ0lJX1NQQUNFIiwiQVNDSUlfTEVGVF9CUkFDS0VUIiwiQVNDSUlfUklHSFRfQlJBQ0tFVCIsImZyb21DaGFyQ29kZSIsInVpbnQ4QXJyYXkiLCJkZWNvZGVyIiwiVGV4dERlY29kZXIiLCJkZWNvZGUiLCJmcm9tQ2hhckNvZGVUcmltbWVkIiwiYmVnaW4iLCJlbmQiLCJsZW5ndGgiLCJzdWJhcnJheSIsImkiLCJpbnB1dCIsIlVpbnQ4QXJyYXkiLCJwb3MiLCJ0b1N0cmluZyIsImxhc3RSaWdodEJyYWNrZXQiLCJsYXN0SW5kZXhPZiIsInN5bnRheCIsImVsZW1lbnQiLCJFcnJvciIsImZpcnN0U3BhY2UiLCJlcnJQb3MiLCJTdHJpbmciLCJUb2tlblBhcnNlciIsIk5vZGUiLCJwYXJlbnROb2RlIiwic3RhcnRQb3MiLCJjaGlsZE5vZGVzIiwiY2xvc2VkIiwidmFsdWVTa2lwIiwidmFsdWVTdGFydCIsInZhbHVlRW5kIiwicHVzaCIsImdldFZhbHVlQXJyYXkiLCJ2YWx1ZVRvVXBwZXJDYXNlIiwidmFsdWVBcnJheSIsImZpbHRlcmVkQXJyYXkiLCJvZmZzZXQiLCJza2lwIiwic2xpY2UiLCJmb3JFYWNoIiwic3ViQXJyYXkiLCJzZXQiLCJjYXNlU2Vuc2l0aXZlIiwiZ2V0VmFsdWVMZW5ndGgiLCJlcXVhbHNBdCIsImluZGV4IiwidWludDhDaGFyIiwiY2hhciIsImlzRGlnaXQiLCJhc2NpaSIsImNoYXJDb2RlQXQiLCJwYXJlbnQiLCJ0cmVlIiwiY3VycmVudE5vZGUiLCJjcmVhdGVOb2RlIiwic3RhdGUiLCJ2YWx1ZUFzU3RyaW5nIiwidW5kZWZpbmVkIiwicHJvY2Vzc1N0cmluZyIsImJyYW5jaCIsIndhbGsiLCJlbG0iLCJjdXJCcmFuY2giLCJwYXJ0aWFsIiwibm9kZSIsImVxdWFscyIsImdldFZhbHVlIiwic2VjdGlvbiIsInNwbGl0IiwibWFwIiwiTnVtYmVyIiwiY2hpbGROb2RlIiwibGVuIiwiY2hlY2tTUCIsImNociIsImVuZFBvcyIsImlzTnVtYmVyIiwiY29udGFpbnNDaGFyIiwic3RhcnRlZCIsImxpdGVyYWxMZW5ndGgiLCJsaXRlcmFsUGx1cyIsInRlc3QiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7O2tCQTJ3QmUsVUFBVUEsT0FBVixFQUFpQztBQUFBLE1BQWRDLE9BQWMsdUVBQUosRUFBSTs7QUFDOUMsTUFBSUMsU0FBUyxJQUFJQyxjQUFKLENBQW1CSCxPQUFuQixFQUE0QkMsT0FBNUIsQ0FBYjtBQUNBLE1BQUlHLFdBQVcsRUFBZjs7QUFFQUEsV0FBU0MsR0FBVCxHQUFlSCxPQUFPSSxNQUFQLEVBQWY7QUFDQUosU0FBT0ssUUFBUDtBQUNBSCxXQUFTSSxPQUFULEdBQW1CTixPQUFPTyxVQUFQLEVBQW5COztBQUVBLE1BQUksQ0FBQyxLQUFELEVBQVEsY0FBUixFQUF3QkMsT0FBeEIsQ0FBZ0MsQ0FBQ04sU0FBU0ksT0FBVCxJQUFvQixFQUFyQixFQUF5QkcsV0FBekIsRUFBaEMsS0FBMkUsQ0FBL0UsRUFBa0Y7QUFDaEZULFdBQU9LLFFBQVA7QUFDQUgsYUFBU0ksT0FBVCxJQUFvQixNQUFNTixPQUFPVSxVQUFQLENBQWtCLDRCQUFsQixDQUExQjtBQUNEOztBQUVELE1BQUksQ0FBQ0MsUUFBUVgsT0FBT1ksU0FBZixDQUFMLEVBQWdDO0FBQzlCWixXQUFPSyxRQUFQO0FBQ0FILGFBQVNXLFVBQVQsR0FBc0JiLE9BQU9j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QztBQUNBO0FBM1hKO0FBNlhEO0FBQ0YiLCJmaWxlIjoicGFyc2VyLmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgU1AsIERJR0lULCBBVE9NX0NIQVIsXG4gIFRBRywgQ09NTUFORCwgdmVyaWZ5XG59IGZyb20gJy4vZm9ybWFsLXN5bnRheCdcblxubGV0IEFTQ0lJX05MID0gMTBcbmxldCBBU0NJSV9DUiA9IDEzXG5sZXQgQVNDSUlfU1BBQ0UgPSAzMlxubGV0IEFTQ0lJX0xFRlRfQlJBQ0tFVCA9IDkxXG5sZXQgQVNDSUlfUklHSFRfQlJBQ0tFVCA9IDkzXG5cbmZ1bmN0aW9uIGZyb21DaGFyQ29kZSAodWludDhBcnJheSkge1xuICBjb25zdCBkZWNvZGVyID0gbmV3IFRleHREZWNvZGVyKClcbiAgcmV0dXJuIGRlY29kZXIuZGVjb2RlKHVpbnQ4QXJyYXkpXG59XG5cbmZ1bmN0aW9uIGZyb21DaGFyQ29kZVRyaW1tZWQgKHVpbnQ4QXJyYXkpIHtcbiAgbGV0IGJlZ2luID0gMFxuICBsZXQgZW5kID0gdWludDhBcnJheS5sZW5ndGhcblxuICB3aGlsZSAodWludDhBcnJheVtiZWdpbl0gPT09IEFTQ0lJX1NQQUNFKSB7XG4gICAgYmVnaW4rK1xuICB9XG5cbiAgd2hpbGUgKHVpbnQ4QXJyYXlbZW5kIC0gMV0gPT09IEFTQ0lJX1NQQUNFKSB7XG4gICAgZW5kLS1cbiAgfVxuXG4gIGlmIChiZWdpbiAhPT0gMCB8fCBlbmQgIT09IHVpbnQ4QXJyYXkubGVuZ3RoKSB7XG4gICAgdWludDhBcnJheSA9IHVpbnQ4QXJyYXkuc3ViYXJyYXkoYmVnaW4sIGVuZClcbiAgfVxuXG4gIHJldHVybiBmcm9tQ2hhckNvZGUodWludDhBcnJheSlcbn1cblxuZnVuY3Rpb24gaXNFbXB0eSAodWludDhBcnJheSkge1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHVpbnQ4QXJyYXkubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAodWludDhBcnJheVtpXSAhPT0gQVNDSUlfU1BBQ0UpIHtcbiAgICAgIHJldHVybiBmYWxzZVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0cnVlXG59XG5cbmNsYXNzIFBhcnNlckluc3RhbmNlIHtcbiAgY29uc3RydWN0b3IgKGlucHV0LCBvcHRpb25zKSB7XG4gICAgdGhpcy5yZW1haW5kZXIgPSBuZXcgVWludDhBcnJheShpbnB1dCB8fCAwKVxuICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnMgfHwge31cbiAgICB0aGlzLnBvcyA9IDBcbiAgfVxuICBnZXRUYWcgKCkge1xuICAgIGlmICghdGhpcy50YWcpIHtcbiAgICAgIHRoaXMudGFnID0gdGhpcy5nZXRFbGVtZW50KFRBRygpICsgJyorJywgdHJ1ZSlcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMudGFnXG4gIH1cblxuICBnZXRDb21tYW5kICgpIHtcbiAgICBpZiAoIXRoaXMuY29tbWFuZCkge1xuICAgICAgdGhpcy5jb21tYW5kID0gdGhpcy5nZXRFbGVtZW50KENPTU1BTkQoKSlcbiAgICB9XG5cbiAgICBzd2l0Y2ggKCh0aGlzLmNvbW1hbmQgfHwgJycpLnRvU3RyaW5nKCkudG9VcHBlckNhc2UoKSkge1xuICAgICAgY2FzZSAnT0snOlxuICAgICAgY2FzZSAnTk8nOlxuICAgICAgY2FzZSAnQkFEJzpcbiAgICAgIGNhc2UgJ1BSRUFVVEgnOlxuICAgICAgY2FzZSAnQllFJzpcbiAgICAgICAgbGV0IGxhc3RSaWdodEJyYWNrZXQgPSB0aGlzLnJlbWFpbmRlci5sYXN0SW5kZXhPZihBU0NJSV9SSUdIVF9CUkFDS0VUKVxuICAgICAgICBpZiAodGhpcy5yZW1haW5kZXJbMV0gPT09IEFTQ0lJX0xFRlRfQlJBQ0tFVCAmJiBsYXN0UmlnaHRCcmFja2V0ID4gMSkge1xuICAgICAgICAgIHRoaXMuaHVtYW5SZWFkYWJsZSA9IGZyb21DaGFyQ29kZVRyaW1tZWQodGhpcy5yZW1haW5kZXIuc3ViYXJyYXkobGFzdFJpZ2h0QnJhY2tldCArIDEpKVxuICAgICAgICAgIHRoaXMucmVtYWluZGVyID0gdGhpcy5yZW1haW5kZXIuc3ViYXJyYXkoMCwgbGFzdFJpZ2h0QnJhY2tldCArIDEpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5odW1hblJlYWRhYmxlID0gZnJvbUNoYXJDb2RlVHJpbW1lZCh0aGlzLnJlbWFpbmRlcilcbiAgICAgICAgICB0aGlzLnJlbWFpbmRlciA9IG5ldyBVaW50OEFycmF5KDApXG4gICAgICAgIH1cbiAgICAgICAgYnJlYWtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5jb21tYW5kXG4gIH1cblxuICBnZXRFbGVtZW50IChzeW50YXgpIHtcbiAgICBsZXQgZWxlbWVudFxuICAgIGlmICh0aGlzLnJlbWFpbmRlclswXSA9PT0gQVNDSUlfU1BBQ0UpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCB3aGl0ZXNwYWNlIGF0IHBvc2l0aW9uICcgKyB0aGlzLnBvcylcbiAgICB9XG5cbiAgICBsZXQgZmlyc3RTcGFjZSA9IHRoaXMucmVtYWluZGVyLmluZGV4T2YoQVNDSUlfU1BBQ0UpXG4gICAgaWYgKHRoaXMucmVtYWluZGVyLmxlbmd0aCA+IDAgJiYgZmlyc3RTcGFjZSAhPT0gMCkge1xuICAgICAgaWYgKGZpcnN0U3BhY2UgPT09IC0xKSB7XG4gICAgICAgIGVsZW1lbnQgPSBmcm9tQ2hhckNvZGUodGhpcy5yZW1haW5kZXIpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBlbGVtZW50ID0gZnJvbUNoYXJDb2RlKHRoaXMucmVtYWluZGVyLnN1YmFycmF5KDAsIGZpcnN0U3BhY2UpKVxuICAgICAgfVxuXG4gICAgICBjb25zdCBlcnJQb3MgPSB2ZXJpZnkoZWxlbWVudCwgc3ludGF4KVxuICAgICAgaWYgKGVyclBvcyA+PSAwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBjaGFyIGF0IHBvc2l0aW9uICcgKyAodGhpcy5wb3MgKyBlcnJQb3MpKVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgZW5kIG9mIGlucHV0IGF0IHBvc2l0aW9uICcgKyB0aGlzLnBvcylcbiAgICB9XG5cbiAgICB0aGlzLnBvcyArPSBlbGVtZW50Lmxlbmd0aFxuICAgIHRoaXMucmVtYWluZGVyID0gdGhpcy5yZW1haW5kZXIuc3ViYXJyYXkoZWxlbWVudC5sZW5ndGgpXG5cbiAgICByZXR1cm4gZWxlbWVudFxuICB9XG5cbiAgZ2V0U3BhY2UgKCkge1xuICAgIGlmICghdGhpcy5yZW1haW5kZXIubGVuZ3RoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgZW5kIG9mIGlucHV0IGF0IHBvc2l0aW9uICcgKyB0aGlzLnBvcylcbiAgICB9XG5cbiAgICBpZiAodmVyaWZ5KFN0cmluZy5mcm9tQ2hhckNvZGUodGhpcy5yZW1haW5kZXJbMF0pLCBTUCgpKSA+PSAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgY2hhciBhdCBwb3NpdGlvbiAnICsgdGhpcy5wb3MpXG4gICAgfVxuXG4gICAgdGhpcy5wb3MrK1xuICAgIHRoaXMucmVtYWluZGVyID0gdGhpcy5yZW1haW5kZXIuc3ViYXJyYXkoMSlcbiAgfVxuXG4gIGdldEF0dHJpYnV0ZXMgKCkge1xuICAgIGlmICghdGhpcy5yZW1haW5kZXIubGVuZ3RoKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgZW5kIG9mIGlucHV0IGF0IHBvc2l0aW9uICcgKyB0aGlzLnBvcylcbiAgICB9XG5cbiAgICBpZiAodGhpcy5yZW1haW5kZXJbMF0gPT09IEFTQ0lJX1NQQUNFKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgd2hpdGVzcGFjZSBhdCBwb3NpdGlvbiAnICsgdGhpcy5wb3MpXG4gICAgfVxuXG4gICAgcmV0dXJuIG5ldyBUb2tlblBhcnNlcih0aGlzLCB0aGlzLnBvcywgdGhpcy5yZW1haW5kZXIuc3ViYXJyYXkoKSwgdGhpcy5vcHRpb25zKS5nZXRBdHRyaWJ1dGVzKClcbiAgfVxufVxuXG5jbGFzcyBOb2RlIHtcbiAgY29uc3RydWN0b3IgKHVpbnQ4QXJyYXksIHBhcmVudE5vZGUsIHN0YXJ0UG9zKSB7XG4gICAgdGhpcy51aW50OEFycmF5ID0gdWludDhBcnJheVxuICAgIHRoaXMuY2hpbGROb2RlcyA9IFtdXG4gICAgdGhpcy50eXBlID0gZmFsc2VcbiAgICB0aGlzLmNsb3NlZCA9IHRydWVcbiAgICB0aGlzLnZhbHVlU2tpcCA9IFtdXG4gICAgdGhpcy5zdGFydFBvcyA9IHN0YXJ0UG9zXG4gICAgdGhpcy52YWx1ZVN0YXJ0ID0gdGhpcy52YWx1ZUVuZCA9IHR5cGVvZiBzdGFydFBvcyA9PT0gJ251bWJlcicgPyBzdGFydFBvcyArIDEgOiAwXG5cbiAgICBpZiAocGFyZW50Tm9kZSkge1xuICAgICAgdGhpcy5wYXJlbnROb2RlID0gcGFyZW50Tm9kZVxuICAgICAgcGFyZW50Tm9kZS5jaGlsZE5vZGVzLnB1c2godGhpcylcbiAgICB9XG4gIH1cblxuICBnZXRWYWx1ZSAoKSB7XG4gICAgbGV0IHZhbHVlID0gZnJvbUNoYXJDb2RlKHRoaXMuZ2V0VmFsdWVBcnJheSgpKVxuICAgIHJldHVybiB0aGlzLnZhbHVlVG9VcHBlckNhc2UgPyB2YWx1ZS50b1VwcGVyQ2FzZSgpIDogdmFsdWVcbiAgfVxuXG4gIGdldFZhbHVlTGVuZ3RoICgpIHtcbiAgICByZXR1cm4gdGhpcy52YWx1ZUVuZCAtIHRoaXMudmFsdWVTdGFydCAtIHRoaXMudmFsdWVTa2lwLmxlbmd0aFxuICB9XG5cbiAgZ2V0VmFsdWVBcnJheSAoKSB7XG4gICAgY29uc3QgdmFsdWVBcnJheSA9IHRoaXMudWludDhBcnJheS5zdWJhcnJheSh0aGlzLnZhbHVlU3RhcnQsIHRoaXMudmFsdWVFbmQpXG5cbiAgICBpZiAodGhpcy52YWx1ZVNraXAubGVuZ3RoID09PSAwKSB7XG4gICAgICByZXR1cm4gdmFsdWVBcnJheVxuICAgIH1cblxuICAgIGxldCBmaWx0ZXJlZEFycmF5ID0gbmV3IFVpbnQ4QXJyYXkodmFsdWVBcnJheS5sZW5ndGggLSB0aGlzLnZhbHVlU2tpcC5sZW5ndGgpXG4gICAgbGV0IGJlZ2luID0gMFxuICAgIGxldCBvZmZzZXQgPSAwXG4gICAgbGV0IHNraXAgPSB0aGlzLnZhbHVlU2tpcC5zbGljZSgpXG5cbiAgICBza2lwLnB1c2godmFsdWVBcnJheS5sZW5ndGgpXG5cbiAgICBza2lwLmZvckVhY2goZnVuY3Rpb24gKGVuZCkge1xuICAgICAgaWYgKGVuZCA+IGJlZ2luKSB7XG4gICAgICAgIHZhciBzdWJBcnJheSA9IHZhbHVlQXJyYXkuc3ViYXJyYXkoYmVnaW4sIGVuZClcbiAgICAgICAgZmlsdGVyZWRBcnJheS5zZXQoc3ViQXJyYXksIG9mZnNldClcbiAgICAgICAgb2Zmc2V0ICs9IHN1YkFycmF5Lmxlbmd0aFxuICAgICAgfVxuICAgICAgYmVnaW4gPSBlbmQgKyAxXG4gICAgfSlcblxuICAgIHJldHVybiBmaWx0ZXJlZEFycmF5XG4gIH1cblxuICBlcXVhbHMgKHZhbHVlLCBjYXNlU2Vuc2l0aXZlKSB7XG4gICAgaWYgKHRoaXMuZ2V0VmFsdWVMZW5ndGgoKSAhPT0gdmFsdWUubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gZmFsc2VcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5lcXVhbHNBdCh2YWx1ZSwgMCwgY2FzZVNlbnNpdGl2ZSlcbiAgfVxuXG4gIGVxdWFsc0F0ICh2YWx1ZSwgaW5kZXgsIGNhc2VTZW5zaXRpdmUpIHtcbiAgICBjYXNlU2Vuc2l0aXZlID0gdHlwZW9mIGNhc2VTZW5zaXRpdmUgPT09ICdib29sZWFuJyA/IGNhc2VTZW5zaXRpdmUgOiB0cnVlXG5cbiAgICBpZiAoaW5kZXggPCAwKSB7XG4gICAgICBpbmRleCA9IHRoaXMudmFsdWVFbmQgKyBpbmRleFxuXG4gICAgICB3aGlsZSAodGhpcy52YWx1ZVNraXAuaW5kZXhPZih0aGlzLnZhbHVlU3RhcnQgKyBpbmRleCkgPj0gMCkge1xuICAgICAgICBpbmRleC0tXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGluZGV4ID0gdGhpcy52YWx1ZVN0YXJ0ICsgaW5kZXhcbiAgICB9XG5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHZhbHVlLmxlbmd0aDsgaSsrKSB7XG4gICAgICB3aGlsZSAodGhpcy52YWx1ZVNraXAuaW5kZXhPZihpbmRleCAtIHRoaXMudmFsdWVTdGFydCkgPj0gMCkge1xuICAgICAgICBpbmRleCsrXG4gICAgICB9XG5cbiAgICAgIGlmIChpbmRleCA+PSB0aGlzLnZhbHVlRW5kKSB7XG4gICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgfVxuXG4gICAgICBsZXQgdWludDhDaGFyID0gU3RyaW5nLmZyb21DaGFyQ29kZSh0aGlzLnVpbnQ4QXJyYXlbaW5kZXhdKVxuICAgICAgbGV0IGNoYXIgPSB2YWx1ZVtpXVxuXG4gICAgICBpZiAoIWNhc2VTZW5zaXRpdmUpIHtcbiAgICAgICAgdWludDhDaGFyID0gdWludDhDaGFyLnRvVXBwZXJDYXNlKClcbiAgICAgICAgY2hhciA9IGNoYXIudG9VcHBlckNhc2UoKVxuICAgICAgfVxuXG4gICAgICBpZiAodWludDhDaGFyICE9PSBjaGFyKSB7XG4gICAgICAgIHJldHVybiBmYWxzZVxuICAgICAgfVxuXG4gICAgICBpbmRleCsrXG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWVcbiAgfVxuXG4gIGlzTnVtYmVyICgpIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMudmFsdWVFbmQgLSB0aGlzLnZhbHVlU3RhcnQ7IGkrKykge1xuICAgICAgaWYgKHRoaXMudmFsdWVTa2lwLmluZGV4T2YoaSkgPj0gMCkge1xuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuXG4gICAgICBpZiAoIXRoaXMuaXNEaWdpdChpKSkge1xuICAgICAgICByZXR1cm4gZmFsc2VcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZVxuICB9XG5cbiAgaXNEaWdpdCAoaW5kZXgpIHtcbiAgICBpZiAoaW5kZXggPCAwKSB7XG4gICAgICBpbmRleCA9IHRoaXMudmFsdWVFbmQgKyBpbmRleFxuXG4gICAgICB3aGlsZSAodGhpcy52YWx1ZVNraXAuaW5kZXhPZih0aGlzLnZhbHVlU3RhcnQgKyBpbmRleCkgPj0gMCkge1xuICAgICAgICBpbmRleC0tXG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGluZGV4ID0gdGhpcy52YWx1ZVN0YXJ0ICsgaW5kZXhcblxuICAgICAgd2hpbGUgKHRoaXMudmFsdWVTa2lwLmluZGV4T2YodGhpcy52YWx1ZVN0YXJ0ICsgaW5kZXgpID49IDApIHtcbiAgICAgICAgaW5kZXgrK1xuICAgICAgfVxuICAgIH1cblxuICAgIGxldCBhc2NpaSA9IHRoaXMudWludDhBcnJheVtpbmRleF1cbiAgICByZXR1cm4gYXNjaWkgPj0gNDggJiYgYXNjaWkgPD0gNTdcbiAgfVxuXG4gIGNvbnRhaW5zQ2hhciAoY2hhcikge1xuICAgIGxldCBhc2NpaSA9IGNoYXIuY2hhckNvZGVBdCgwKVxuXG4gICAgZm9yIChsZXQgaSA9IHRoaXMudmFsdWVTdGFydDsgaSA8IHRoaXMudmFsdWVFbmQ7IGkrKykge1xuICAgICAgaWYgKHRoaXMudmFsdWVTa2lwLmluZGV4T2YoaSAtIHRoaXMudmFsdWVTdGFydCkgPj0gMCkge1xuICAgICAgICBjb250aW51ZVxuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy51aW50OEFycmF5W2ldID09PSBhc2NpaSkge1xuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBmYWxzZVxuICB9XG59XG5cbmNsYXNzIFRva2VuUGFyc2VyIHtcbiAgY29uc3RydWN0b3IgKHBhcmVudCwgc3RhcnRQb3MsIHVpbnQ4QXJyYXksIG9wdGlvbnMgPSB7fSkge1xuICAgIHRoaXMudWludDhBcnJheSA9IHVpbnQ4QXJyYXlcbiAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zXG4gICAgdGhpcy5wYXJlbnQgPSBwYXJlbnRcblxuICAgIHRoaXMudHJlZSA9IHRoaXMuY3VycmVudE5vZGUgPSB0aGlzLmNyZWF0ZU5vZGUoKVxuICAgIHRoaXMucG9zID0gc3RhcnRQb3MgfHwgMFxuXG4gICAgdGhpcy5jdXJyZW50Tm9kZS50eXBlID0gJ1RSRUUnXG5cbiAgICB0aGlzLnN0YXRlID0gJ05PUk1BTCdcblxuICAgIGlmICh0aGlzLm9wdGlvbnMudmFsdWVBc1N0cmluZyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICB0aGlzLm9wdGlvbnMudmFsdWVBc1N0cmluZyA9IHRydWVcbiAgICB9XG5cbiAgICB0aGlzLnByb2Nlc3NTdHJpbmcoKVxuICB9XG5cbiAgZ2V0QXR0cmlidXRlcyAoKSB7XG4gICAgbGV0IGF0dHJpYnV0ZXMgPSBbXVxuICAgIGxldCBicmFuY2ggPSBhdHRyaWJ1dGVzXG5cbiAgICBsZXQgd2FsayA9IG5vZGUgPT4ge1xuICAgICAgbGV0IGVsbVxuICAgICAgbGV0IGN1ckJyYW5jaCA9IGJyYW5jaFxuICAgICAgbGV0IHBhcnRpYWxcblxuICAgICAgaWYgKCFub2RlLmNsb3NlZCAmJiBub2RlLnR5cGUgPT09ICdTRVFVRU5DRScgJiYgbm9kZS5lcXVhbHMoJyonKSkge1xuICAgICAgICBub2RlLmNsb3NlZCA9IHRydWVcbiAgICAgICAgbm9kZS50eXBlID0gJ0FUT00nXG4gICAgICB9XG5cbiAgICAgIC8vIElmIHRoZSBub2RlIHdhcyBuZXZlciBjbG9zZWQsIHRocm93IGl0XG4gICAgICBpZiAoIW5vZGUuY2xvc2VkKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBlbmQgb2YgaW5wdXQgYXQgcG9zaXRpb24gJyArICh0aGlzLnBvcyArIHRoaXMudWludDhBcnJheS5sZW5ndGggLSAxKSlcbiAgICAgIH1cblxuICAgICAgc3dpdGNoIChub2RlLnR5cGUudG9VcHBlckNhc2UoKSkge1xuICAgICAgICBjYXNlICdMSVRFUkFMJzpcbiAgICAgICAgY2FzZSAnU1RSSU5HJzpcbiAgICAgICAgICBlbG0gPSB7XG4gICAgICAgICAgICB0eXBlOiBub2RlLnR5cGUudG9VcHBlckNhc2UoKSxcbiAgICAgICAgICAgIHZhbHVlOiB0aGlzLm9wdGlvbnMudmFsdWVBc1N0cmluZyA/IG5vZGUuZ2V0VmFsdWUoKSA6IG5vZGUuZ2V0VmFsdWVBcnJheSgpXG4gICAgICAgICAgfVxuICAgICAgICAgIGJyYW5jaC5wdXNoKGVsbSlcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdTRVFVRU5DRSc6XG4gICAgICAgICAgZWxtID0ge1xuICAgICAgICAgICAgdHlwZTogbm9kZS50eXBlLnRvVXBwZXJDYXNlKCksXG4gICAgICAgICAgICB2YWx1ZTogbm9kZS5nZXRWYWx1ZSgpXG4gICAgICAgICAgfVxuICAgICAgICAgIGJyYW5jaC5wdXNoKGVsbSlcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdBVE9NJzpcbiAgICAgICAgICBpZiAobm9kZS5lcXVhbHMoJ05JTCcsIHRydWUpKSB7XG4gICAgICAgICAgICBicmFuY2gucHVzaChudWxsKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICB9XG4gICAgICAgICAgZWxtID0ge1xuICAgICAgICAgICAgdHlwZTogbm9kZS50eXBlLnRvVXBwZXJDYXNlKCksXG4gICAgICAgICAgICB2YWx1ZTogbm9kZS5nZXRWYWx1ZSgpXG4gICAgICAgICAgfVxuICAgICAgICAgIGJyYW5jaC5wdXNoKGVsbSlcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlICdTRUNUSU9OJzpcbiAgICAgICAgICBicmFuY2ggPSBicmFuY2hbYnJhbmNoLmxlbmd0aCAtIDFdLnNlY3Rpb24gPSBbXVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ0xJU1QnOlxuICAgICAgICAgIGVsbSA9IFtdXG4gICAgICAgICAgYnJhbmNoLnB1c2goZWxtKVxuICAgICAgICAgIGJyYW5jaCA9IGVsbVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ1BBUlRJQUwnOlxuICAgICAgICAgIHBhcnRpYWwgPSBub2RlLmdldFZhbHVlKCkuc3BsaXQoJy4nKS5tYXAoTnVtYmVyKVxuICAgICAgICAgIGJyYW5jaFticmFuY2gubGVuZ3RoIC0gMV0ucGFydGlhbCA9IHBhcnRpYWxcbiAgICAgICAgICBicmVha1xuICAgICAgfVxuXG4gICAgICBub2RlLmNoaWxkTm9kZXMuZm9yRWFjaChmdW5jdGlvbiAoY2hpbGROb2RlKSB7XG4gICAgICAgIHdhbGsoY2hpbGROb2RlKVxuICAgICAgfSlcbiAgICAgIGJyYW5jaCA9IGN1ckJyYW5jaFxuICAgIH1cblxuICAgIHdhbGsodGhpcy50cmVlKVxuXG4gICAgcmV0dXJuIGF0dHJpYnV0ZXNcbiAgfVxuXG4gIGNyZWF0ZU5vZGUgKHBhcmVudE5vZGUsIHN0YXJ0UG9zKSB7XG4gICAgcmV0dXJuIG5ldyBOb2RlKHRoaXMudWludDhBcnJheSwgcGFyZW50Tm9kZSwgc3RhcnRQb3MpXG4gIH1cblxuICBwcm9jZXNzU3RyaW5nICgpIHtcbiAgICBsZXQgaVxuICAgIGxldCBsZW5cbiAgICBjb25zdCBjaGVja1NQID0gKHBvcykgPT4ge1xuICAgICAgLy8ganVtcCB0byB0aGUgbmV4dCBub24gd2hpdGVzcGFjZSBwb3NcbiAgICAgIHdoaWxlICh0aGlzLnVpbnQ4QXJyYXlbaSArIDFdID09PSAnICcpIHtcbiAgICAgICAgaSsrXG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChpID0gMCwgbGVuID0gdGhpcy51aW50OEFycmF5Lmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICBsZXQgY2hyID0gU3RyaW5nLmZyb21DaGFyQ29kZSh0aGlzLnVpbnQ4QXJyYXlbaV0pXG5cbiAgICAgIHN3aXRjaCAodGhpcy5zdGF0ZSkge1xuICAgICAgICBjYXNlICdOT1JNQUwnOlxuXG4gICAgICAgICAgc3dpdGNoIChjaHIpIHtcbiAgICAgICAgICAgIC8vIERRVU9URSBzdGFydHMgYSBuZXcgc3RyaW5nXG4gICAgICAgICAgICBjYXNlICdcIic6XG4gICAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUgPSB0aGlzLmNyZWF0ZU5vZGUodGhpcy5jdXJyZW50Tm9kZSwgaSlcbiAgICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZS50eXBlID0gJ3N0cmluZydcbiAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9ICdTVFJJTkcnXG4gICAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUuY2xvc2VkID0gZmFsc2VcbiAgICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgICAgLy8gKCBzdGFydHMgYSBuZXcgbGlzdFxuICAgICAgICAgICAgY2FzZSAnKCc6XG4gICAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUgPSB0aGlzLmNyZWF0ZU5vZGUodGhpcy5jdXJyZW50Tm9kZSwgaSlcbiAgICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZS50eXBlID0gJ0xJU1QnXG4gICAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUuY2xvc2VkID0gZmFsc2VcbiAgICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgICAgLy8gKSBjbG9zZXMgYSBsaXN0XG4gICAgICAgICAgICBjYXNlICcpJzpcbiAgICAgICAgICAgICAgaWYgKHRoaXMuY3VycmVudE5vZGUudHlwZSAhPT0gJ0xJU1QnKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIGxpc3QgdGVybWluYXRvciApIGF0IHBvc2l0aW9uICcgKyAodGhpcy5wb3MgKyBpKSlcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUuY2xvc2VkID0gdHJ1ZVxuICAgICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLmVuZFBvcyA9IHRoaXMucG9zICsgaVxuICAgICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlID0gdGhpcy5jdXJyZW50Tm9kZS5wYXJlbnROb2RlXG5cbiAgICAgICAgICAgICAgY2hlY2tTUCgpXG4gICAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICAgIC8vIF0gY2xvc2VzIHNlY3Rpb24gZ3JvdXBcbiAgICAgICAgICAgIGNhc2UgJ10nOlxuICAgICAgICAgICAgICBpZiAodGhpcy5jdXJyZW50Tm9kZS50eXBlICE9PSAnU0VDVElPTicpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgc2VjdGlvbiB0ZXJtaW5hdG9yIF0gYXQgcG9zaXRpb24gJyArICh0aGlzLnBvcyArIGkpKVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUuY2xvc2VkID0gdHJ1ZVxuICAgICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLmVuZFBvcyA9IHRoaXMucG9zICsgaVxuICAgICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlID0gdGhpcy5jdXJyZW50Tm9kZS5wYXJlbnROb2RlXG4gICAgICAgICAgICAgIGNoZWNrU1AoKVxuICAgICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgICAvLyA8IHN0YXJ0cyBhIG5ldyBwYXJ0aWFsXG4gICAgICAgICAgICBjYXNlICc8JzpcbiAgICAgICAgICAgICAgaWYgKFN0cmluZy5mcm9tQ2hhckNvZGUodGhpcy51aW50OEFycmF5W2kgLSAxXSkgIT09ICddJykge1xuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUgPSB0aGlzLmNyZWF0ZU5vZGUodGhpcy5jdXJyZW50Tm9kZSwgaSlcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLnR5cGUgPSAnQVRPTSdcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLnZhbHVlU3RhcnQgPSBpXG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZS52YWx1ZUVuZCA9IGkgKyAxXG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9ICdBVE9NJ1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUgPSB0aGlzLmNyZWF0ZU5vZGUodGhpcy5jdXJyZW50Tm9kZSwgaSlcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLnR5cGUgPSAnUEFSVElBTCdcbiAgICAgICAgICAgICAgICB0aGlzLnN0YXRlID0gJ1BBUlRJQUwnXG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZS5jbG9zZWQgPSBmYWxzZVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICAgIC8vIHsgc3RhcnRzIGEgbmV3IGxpdGVyYWxcbiAgICAgICAgICAgIGNhc2UgJ3snOlxuICAgICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlID0gdGhpcy5jcmVhdGVOb2RlKHRoaXMuY3VycmVudE5vZGUsIGkpXG4gICAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUudHlwZSA9ICdMSVRFUkFMJ1xuICAgICAgICAgICAgICB0aGlzLnN0YXRlID0gJ0xJVEVSQUwnXG4gICAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUuY2xvc2VkID0gZmFsc2VcbiAgICAgICAgICAgICAgYnJlYWtcblxuICAgICAgICAgICAgLy8gKCBzdGFydHMgYSBuZXcgc2VxdWVuY2VcbiAgICAgICAgICAgIGNhc2UgJyonOlxuICAgICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlID0gdGhpcy5jcmVhdGVOb2RlKHRoaXMuY3VycmVudE5vZGUsIGkpXG4gICAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUudHlwZSA9ICdTRVFVRU5DRSdcbiAgICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZS52YWx1ZVN0YXJ0ID0gaVxuICAgICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLnZhbHVlRW5kID0gaSArIDFcbiAgICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZS5jbG9zZWQgPSBmYWxzZVxuICAgICAgICAgICAgICB0aGlzLnN0YXRlID0gJ1NFUVVFTkNFJ1xuICAgICAgICAgICAgICBicmVha1xuXG4gICAgICAgICAgICAvLyBub3JtYWxseSBhIHNwYWNlIHNob3VsZCBuZXZlciBvY2N1clxuICAgICAgICAgICAgY2FzZSAnICc6XG4gICAgICAgICAgICAgIC8vIGp1c3QgaWdub3JlXG4gICAgICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgICAgIC8vIFsgc3RhcnRzIHNlY3Rpb25cbiAgICAgICAgICAgIGNhc2UgJ1snOlxuICAgICAgICAgICAgICAvLyBJZiBpdCBpcyB0aGUgKmZpcnN0KiBlbGVtZW50IGFmdGVyIHJlc3BvbnNlIGNvbW1hbmQsIHRoZW4gcHJvY2VzcyBhcyBhIHJlc3BvbnNlIGFyZ3VtZW50IGxpc3RcbiAgICAgICAgICAgICAgaWYgKFsnT0snLCAnTk8nLCAnQkFEJywgJ0JZRScsICdQUkVBVVRIJ10uaW5kZXhPZih0aGlzLnBhcmVudC5jb21tYW5kLnRvVXBwZXJDYXNlKCkpID49IDAgJiYgdGhpcy5jdXJyZW50Tm9kZSA9PT0gdGhpcy50cmVlKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZS5lbmRQb3MgPSB0aGlzLnBvcyArIGlcblxuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUgPSB0aGlzLmNyZWF0ZU5vZGUodGhpcy5jdXJyZW50Tm9kZSwgaSlcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLnR5cGUgPSAnQVRPTSdcblxuICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUgPSB0aGlzLmNyZWF0ZU5vZGUodGhpcy5jdXJyZW50Tm9kZSwgaSlcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLnR5cGUgPSAnU0VDVElPTidcbiAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLmNsb3NlZCA9IGZhbHNlXG4gICAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9ICdOT1JNQUwnXG5cbiAgICAgICAgICAgICAgICAvLyBSRkMyMjIxIGRlZmluZXMgYSByZXNwb25zZSBjb2RlIFJFRkVSUkFMIHdob3NlIHBheWxvYWQgaXMgYW5cbiAgICAgICAgICAgICAgICAvLyBSRkMyMTkyL1JGQzUwOTIgaW1hcHVybCB0aGF0IHdlIHdpbGwgdHJ5IHRvIHBhcnNlIGFzIGFuIEFUT00gYnV0XG4gICAgICAgICAgICAgICAgLy8gZmFpbCBxdWl0ZSBiYWRseSBhdCBwYXJzaW5nLiAgU2luY2UgdGhlIGltYXB1cmwgaXMgc3VjaCBhIHVuaXF1ZVxuICAgICAgICAgICAgICAgIC8vIChhbmQgY3JhenkpIHRlcm0sIHdlIGp1c3Qgc3BlY2lhbGl6ZSB0aGF0IGNhc2UgaGVyZS5cbiAgICAgICAgICAgICAgICBpZiAoZnJvbUNoYXJDb2RlKHRoaXMudWludDhBcnJheS5zdWJhcnJheShpICsgMSwgaSArIDEwKSkudG9VcHBlckNhc2UoKSA9PT0gJ1JFRkVSUkFMICcpIHtcbiAgICAgICAgICAgICAgICAgIC8vIGNyZWF0ZSB0aGUgUkVGRVJSQUwgYXRvbVxuICAgICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZSA9IHRoaXMuY3JlYXRlTm9kZSh0aGlzLmN1cnJlbnROb2RlLCB0aGlzLnBvcyArIGkgKyAxKVxuICAgICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZS50eXBlID0gJ0FUT00nXG4gICAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLmVuZFBvcyA9IHRoaXMucG9zICsgaSArIDhcbiAgICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUudmFsdWVTdGFydCA9IGkgKyAxXG4gICAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLnZhbHVlRW5kID0gaSArIDlcbiAgICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUudmFsdWVUb1VwcGVyQ2FzZSA9IHRydWVcbiAgICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUgPSB0aGlzLmN1cnJlbnROb2RlLnBhcmVudE5vZGVcblxuICAgICAgICAgICAgICAgICAgLy8gZWF0IGFsbCB0aGUgd2F5IHRocm91Z2ggdGhlIF0gdG8gYmUgdGhlICBJTUFQVVJMIHRva2VuLlxuICAgICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZSA9IHRoaXMuY3JlYXRlTm9kZSh0aGlzLmN1cnJlbnROb2RlLCB0aGlzLnBvcyArIGkgKyAxMClcbiAgICAgICAgICAgICAgICAgIC8vIGp1c3QgY2FsbCB0aGlzIGFuIEFUT00sIGV2ZW4gdGhvdWdoIElNQVBVUkwgbWlnaHQgYmUgbW9yZSBjb3JyZWN0XG4gICAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLnR5cGUgPSAnQVRPTSdcbiAgICAgICAgICAgICAgICAgIC8vIGp1bXAgaSB0byB0aGUgJ10nXG4gICAgICAgICAgICAgICAgICBpID0gdGhpcy51aW50OEFycmF5LmluZGV4T2YoQVNDSUlfUklHSFRfQlJBQ0tFVCwgaSArIDEwKVxuICAgICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZS5lbmRQb3MgPSB0aGlzLnBvcyArIGkgLSAxXG4gICAgICAgICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLnZhbHVlU3RhcnQgPSB0aGlzLmN1cnJlbnROb2RlLnN0YXJ0UG9zIC0gdGhpcy5wb3NcbiAgICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUudmFsdWVFbmQgPSB0aGlzLmN1cnJlbnROb2RlLmVuZFBvcyAtIHRoaXMucG9zICsgMVxuICAgICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZSA9IHRoaXMuY3VycmVudE5vZGUucGFyZW50Tm9kZVxuXG4gICAgICAgICAgICAgICAgICAvLyBjbG9zZSBvdXQgdGhlIFNFQ1RJT05cbiAgICAgICAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUuY2xvc2VkID0gdHJ1ZVxuICAgICAgICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZSA9IHRoaXMuY3VycmVudE5vZGUucGFyZW50Tm9kZVxuICAgICAgICAgICAgICAgICAgY2hlY2tTUCgpXG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgLyogZmFsbHMgdGhyb3VnaCAqL1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgLy8gQW55IEFUT00gc3VwcG9ydGVkIGNoYXIgc3RhcnRzIGEgbmV3IEF0b20gc2VxdWVuY2UsIG90aGVyd2lzZSB0aHJvdyBhbiBlcnJvclxuICAgICAgICAgICAgICAvLyBBbGxvdyBcXCBhcyB0aGUgZmlyc3QgY2hhciBmb3IgYXRvbSB0byBzdXBwb3J0IHN5c3RlbSBmbGFnc1xuICAgICAgICAgICAgICAvLyBBbGxvdyAlIHRvIHN1cHBvcnQgTElTVCAnJyAlXG4gICAgICAgICAgICAgIGlmIChBVE9NX0NIQVIoKS5pbmRleE9mKGNocikgPCAwICYmIGNociAhPT0gJ1xcXFwnICYmIGNociAhPT0gJyUnKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIGNoYXIgYXQgcG9zaXRpb24gJyArICh0aGlzLnBvcyArIGkpKVxuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZSA9IHRoaXMuY3JlYXRlTm9kZSh0aGlzLmN1cnJlbnROb2RlLCBpKVxuICAgICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLnR5cGUgPSAnQVRPTSdcbiAgICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZS52YWx1ZVN0YXJ0ID0gaVxuICAgICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLnZhbHVlRW5kID0gaSArIDFcbiAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9ICdBVE9NJ1xuICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ0FUT00nOlxuXG4gICAgICAgICAgLy8gc3BhY2UgZmluaXNoZXMgYW4gYXRvbVxuICAgICAgICAgIGlmIChjaHIgPT09ICcgJykge1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZS5lbmRQb3MgPSB0aGlzLnBvcyArIGkgLSAxXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlID0gdGhpcy5jdXJyZW50Tm9kZS5wYXJlbnROb2RlXG4gICAgICAgICAgICB0aGlzLnN0YXRlID0gJ05PUk1BTCdcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy9cbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLnBhcmVudE5vZGUgJiZcbiAgICAgICAgICAgIChcbiAgICAgICAgICAgICAgKGNociA9PT0gJyknICYmIHRoaXMuY3VycmVudE5vZGUucGFyZW50Tm9kZS50eXBlID09PSAnTElTVCcpIHx8XG4gICAgICAgICAgICAgIChjaHIgPT09ICddJyAmJiB0aGlzLmN1cnJlbnROb2RlLnBhcmVudE5vZGUudHlwZSA9PT0gJ1NFQ1RJT04nKVxuICAgICAgICAgICAgKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZS5lbmRQb3MgPSB0aGlzLnBvcyArIGkgLSAxXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlID0gdGhpcy5jdXJyZW50Tm9kZS5wYXJlbnROb2RlXG5cbiAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUuY2xvc2VkID0gdHJ1ZVxuICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZS5lbmRQb3MgPSB0aGlzLnBvcyArIGlcbiAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUgPSB0aGlzLmN1cnJlbnROb2RlLnBhcmVudE5vZGVcbiAgICAgICAgICAgIHRoaXMuc3RhdGUgPSAnTk9STUFMJ1xuXG4gICAgICAgICAgICBjaGVja1NQKClcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKChjaHIgPT09ICcsJyB8fCBjaHIgPT09ICc6JykgJiYgdGhpcy5jdXJyZW50Tm9kZS5pc051bWJlcigpKSB7XG4gICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLnR5cGUgPSAnU0VRVUVOQ0UnXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLmNsb3NlZCA9IHRydWVcbiAgICAgICAgICAgIHRoaXMuc3RhdGUgPSAnU0VRVUVOQ0UnXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgLy8gWyBzdGFydHMgYSBzZWN0aW9uIGdyb3VwIGZvciB0aGlzIGVsZW1lbnRcbiAgICAgICAgICBpZiAoY2hyID09PSAnWycgJiYgKHRoaXMuY3VycmVudE5vZGUuZXF1YWxzKCdCT0RZJywgZmFsc2UpIHx8IHRoaXMuY3VycmVudE5vZGUuZXF1YWxzKCdCT0RZLlBFRUsnLCBmYWxzZSkpKSB7XG4gICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLmVuZFBvcyA9IHRoaXMucG9zICsgaVxuICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZSA9IHRoaXMuY3JlYXRlTm9kZSh0aGlzLmN1cnJlbnROb2RlLnBhcmVudE5vZGUsIHRoaXMucG9zICsgaSlcbiAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUudHlwZSA9ICdTRUNUSU9OJ1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZS5jbG9zZWQgPSBmYWxzZVxuICAgICAgICAgICAgdGhpcy5zdGF0ZSA9ICdOT1JNQUwnXG4gICAgICAgICAgICBicmVha1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChjaHIgPT09ICc8Jykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIHN0YXJ0IG9mIHBhcnRpYWwgYXQgcG9zaXRpb24gJyArIHRoaXMucG9zKVxuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIGlmIHRoZSBjaGFyIGlzIG5vdCBBVE9NIGNvbXBhdGlibGUsIHRocm93LiBBbGxvdyBcXCogYXMgYW4gZXhjZXB0aW9uXG4gICAgICAgICAgaWYgKEFUT01fQ0hBUigpLmluZGV4T2YoY2hyKSA8IDAgJiYgY2hyICE9PSAnXScgJiYgIShjaHIgPT09ICcqJyAmJiB0aGlzLmN1cnJlbnROb2RlLmVxdWFscygnXFxcXCcpKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIGNoYXIgYXQgcG9zaXRpb24gJyArICh0aGlzLnBvcyArIGkpKVxuICAgICAgICAgIH0gZWxzZSBpZiAodGhpcy5jdXJyZW50Tm9kZS5lcXVhbHMoJ1xcXFwqJykpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBjaGFyIGF0IHBvc2l0aW9uICcgKyAodGhpcy5wb3MgKyBpKSlcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLnZhbHVlRW5kID0gaSArIDFcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ1NUUklORyc6XG5cbiAgICAgICAgICAvLyBEUVVPVEUgZW5kcyB0aGUgc3RyaW5nIHNlcXVlbmNlXG4gICAgICAgICAgaWYgKGNociA9PT0gJ1wiJykge1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZS5lbmRQb3MgPSB0aGlzLnBvcyArIGlcbiAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUuY2xvc2VkID0gdHJ1ZVxuICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZSA9IHRoaXMuY3VycmVudE5vZGUucGFyZW50Tm9kZVxuICAgICAgICAgICAgdGhpcy5zdGF0ZSA9ICdOT1JNQUwnXG5cbiAgICAgICAgICAgIGNoZWNrU1AoKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyBcXCBFc2NhcGVzIHRoZSBmb2xsb3dpbmcgY2hhclxuICAgICAgICAgIGlmIChjaHIgPT09ICdcXFxcJykge1xuICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZS52YWx1ZVNraXAucHVzaChpIC0gdGhpcy5jdXJyZW50Tm9kZS52YWx1ZVN0YXJ0KVxuICAgICAgICAgICAgaSsrXG4gICAgICAgICAgICBpZiAoaSA+PSBsZW4pIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIGVuZCBvZiBpbnB1dCBhdCBwb3NpdGlvbiAnICsgKHRoaXMucG9zICsgaSkpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjaHIgPSBTdHJpbmcuZnJvbUNoYXJDb2RlKHRoaXMudWludDhBcnJheVtpXSlcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvKiAvLyBza2lwIHRoaXMgY2hlY2ssIG90aGVyd2lzZSB0aGUgcGFyc2VyIG1pZ2h0IGV4cGxvZGUgb24gYmluYXJ5IGlucHV0XG4gICAgICAgICAgaWYgKFRFWFRfQ0hBUigpLmluZGV4T2YoY2hyKSA8IDApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIGNoYXIgYXQgcG9zaXRpb24gJyArICh0aGlzLnBvcyArIGkpKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgKi9cblxuICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUudmFsdWVFbmQgPSBpICsgMVxuICAgICAgICAgIGJyZWFrXG5cbiAgICAgICAgY2FzZSAnUEFSVElBTCc6XG4gICAgICAgICAgaWYgKGNociA9PT0gJz4nKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5jdXJyZW50Tm9kZS5lcXVhbHNBdCgnLicsIC0xKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgZW5kIG9mIHBhcnRpYWwgYXQgcG9zaXRpb24gJyArIHRoaXMucG9zKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZS5lbmRQb3MgPSB0aGlzLnBvcyArIGlcbiAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUuY2xvc2VkID0gdHJ1ZVxuICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZSA9IHRoaXMuY3VycmVudE5vZGUucGFyZW50Tm9kZVxuICAgICAgICAgICAgdGhpcy5zdGF0ZSA9ICdOT1JNQUwnXG4gICAgICAgICAgICBjaGVja1NQKClcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKGNociA9PT0gJy4nICYmICghdGhpcy5jdXJyZW50Tm9kZS5nZXRWYWx1ZUxlbmd0aCgpIHx8IHRoaXMuY3VycmVudE5vZGUuY29udGFpbnNDaGFyKCcuJykpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgcGFydGlhbCBzZXBhcmF0b3IgLiBhdCBwb3NpdGlvbiAnICsgdGhpcy5wb3MpXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKERJR0lUKCkuaW5kZXhPZihjaHIpIDwgMCAmJiBjaHIgIT09ICcuJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIGNoYXIgYXQgcG9zaXRpb24gJyArICh0aGlzLnBvcyArIGkpKVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChjaHIgIT09ICcuJyAmJiAodGhpcy5jdXJyZW50Tm9kZS5lcXVhbHMoJzAnKSB8fCB0aGlzLmN1cnJlbnROb2RlLmVxdWFsc0F0KCcuMCcsIC0yKSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBwYXJ0aWFsIGF0IHBvc2l0aW9uICcgKyAodGhpcy5wb3MgKyBpKSlcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLnZhbHVlRW5kID0gaSArIDFcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ0xJVEVSQUwnOlxuICAgICAgICAgIGlmICh0aGlzLmN1cnJlbnROb2RlLnN0YXJ0ZWQpIHtcbiAgICAgICAgICAgIGlmIChjaHIgPT09ICdcXHUwMDAwJykge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgXFxcXHgwMCBhdCBwb3NpdGlvbiAnICsgKHRoaXMucG9zICsgaSkpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLnZhbHVlRW5kID0gaSArIDFcblxuICAgICAgICAgICAgaWYgKHRoaXMuY3VycmVudE5vZGUuZ2V0VmFsdWVMZW5ndGgoKSA+PSB0aGlzLmN1cnJlbnROb2RlLmxpdGVyYWxMZW5ndGgpIHtcbiAgICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZS5lbmRQb3MgPSB0aGlzLnBvcyArIGlcbiAgICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZS5jbG9zZWQgPSB0cnVlXG4gICAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUgPSB0aGlzLmN1cnJlbnROb2RlLnBhcmVudE5vZGVcbiAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9ICdOT1JNQUwnXG4gICAgICAgICAgICAgIGNoZWNrU1AoKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoY2hyID09PSAnKycgJiYgdGhpcy5vcHRpb25zLmxpdGVyYWxQbHVzKSB7XG4gICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLmxpdGVyYWxQbHVzID0gdHJ1ZVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoY2hyID09PSAnfScpIHtcbiAgICAgICAgICAgIGlmICghKCdsaXRlcmFsTGVuZ3RoJyBpbiB0aGlzLmN1cnJlbnROb2RlKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgbGl0ZXJhbCBwcmVmaXggZW5kIGNoYXIgfSBhdCBwb3NpdGlvbiAnICsgKHRoaXMucG9zICsgaSkpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAodGhpcy51aW50OEFycmF5W2kgKyAxXSA9PT0gQVNDSUlfTkwpIHtcbiAgICAgICAgICAgICAgaSsrXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHRoaXMudWludDhBcnJheVtpICsgMV0gPT09IEFTQ0lJX0NSICYmIHRoaXMudWludDhBcnJheVtpICsgMl0gPT09IEFTQ0lJX05MKSB7XG4gICAgICAgICAgICAgIGkgKz0gMlxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIGNoYXIgYXQgcG9zaXRpb24gJyArICh0aGlzLnBvcyArIGkpKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZS52YWx1ZVN0YXJ0ID0gaSArIDFcbiAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUubGl0ZXJhbExlbmd0aCA9IE51bWJlcih0aGlzLmN1cnJlbnROb2RlLmxpdGVyYWxMZW5ndGgpXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLnN0YXJ0ZWQgPSB0cnVlXG5cbiAgICAgICAgICAgIGlmICghdGhpcy5jdXJyZW50Tm9kZS5saXRlcmFsTGVuZ3RoKSB7XG4gICAgICAgICAgICAgIC8vIHNwZWNpYWwgY2FzZSB3aGVyZSBsaXRlcmFsIGNvbnRlbnQgbGVuZ3RoIGlzIDBcbiAgICAgICAgICAgICAgLy8gY2xvc2UgdGhlIG5vZGUgcmlnaHQgYXdheSwgZG8gbm90IHdhaXQgZm9yIGFkZGl0aW9uYWwgaW5wdXRcbiAgICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZS5lbmRQb3MgPSB0aGlzLnBvcyArIGlcbiAgICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZS5jbG9zZWQgPSB0cnVlXG4gICAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUgPSB0aGlzLmN1cnJlbnROb2RlLnBhcmVudE5vZGVcbiAgICAgICAgICAgICAgdGhpcy5zdGF0ZSA9ICdOT1JNQUwnXG4gICAgICAgICAgICAgIGNoZWNrU1AoKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKERJR0lUKCkuaW5kZXhPZihjaHIpIDwgMCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIGNoYXIgYXQgcG9zaXRpb24gJyArICh0aGlzLnBvcyArIGkpKVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodGhpcy5jdXJyZW50Tm9kZS5saXRlcmFsTGVuZ3RoID09PSAnMCcpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBsaXRlcmFsIGF0IHBvc2l0aW9uICcgKyAodGhpcy5wb3MgKyBpKSlcbiAgICAgICAgICB9XG4gICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZS5saXRlcmFsTGVuZ3RoID0gKHRoaXMuY3VycmVudE5vZGUubGl0ZXJhbExlbmd0aCB8fCAnJykgKyBjaHJcbiAgICAgICAgICBicmVha1xuXG4gICAgICAgIGNhc2UgJ1NFUVVFTkNFJzpcbiAgICAgICAgICAvLyBzcGFjZSBmaW5pc2hlcyB0aGUgc2VxdWVuY2Ugc2V0XG4gICAgICAgICAgaWYgKGNociA9PT0gJyAnKSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuY3VycmVudE5vZGUuaXNEaWdpdCgtMSkgJiYgIXRoaXMuY3VycmVudE5vZGUuZXF1YWxzQXQoJyonLCAtMSkpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIHdoaXRlc3BhY2UgYXQgcG9zaXRpb24gJyArICh0aGlzLnBvcyArIGkpKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAodGhpcy5jdXJyZW50Tm9kZS5lcXVhbHNBdCgnKicsIC0xKSAmJiAhdGhpcy5jdXJyZW50Tm9kZS5lcXVhbHNBdCgnOicsIC0yKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgd2hpdGVzcGFjZSBhdCBwb3NpdGlvbiAnICsgKHRoaXMucG9zICsgaSkpXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUuY2xvc2VkID0gdHJ1ZVxuICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZS5lbmRQb3MgPSB0aGlzLnBvcyArIGkgLSAxXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlID0gdGhpcy5jdXJyZW50Tm9kZS5wYXJlbnROb2RlXG4gICAgICAgICAgICB0aGlzLnN0YXRlID0gJ05PUk1BTCdcbiAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgfSBlbHNlIGlmICh0aGlzLmN1cnJlbnROb2RlLnBhcmVudE5vZGUgJiZcbiAgICAgICAgICAgIGNociA9PT0gJ10nICYmXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLnBhcmVudE5vZGUudHlwZSA9PT0gJ1NFQ1RJT04nKSB7XG4gICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLmVuZFBvcyA9IHRoaXMucG9zICsgaSAtIDFcbiAgICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUgPSB0aGlzLmN1cnJlbnROb2RlLnBhcmVudE5vZGVcblxuICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZS5jbG9zZWQgPSB0cnVlXG4gICAgICAgICAgICB0aGlzLmN1cnJlbnROb2RlLmVuZFBvcyA9IHRoaXMucG9zICsgaVxuICAgICAgICAgICAgdGhpcy5jdXJyZW50Tm9kZSA9IHRoaXMuY3VycmVudE5vZGUucGFyZW50Tm9kZVxuICAgICAgICAgICAgdGhpcy5zdGF0ZSA9ICdOT1JNQUwnXG5cbiAgICAgICAgICAgIGNoZWNrU1AoKVxuICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoY2hyID09PSAnOicpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy5jdXJyZW50Tm9kZS5pc0RpZ2l0KC0xKSAmJiAhdGhpcy5jdXJyZW50Tm9kZS5lcXVhbHNBdCgnKicsIC0xKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgcmFuZ2Ugc2VwYXJhdG9yIDogYXQgcG9zaXRpb24gJyArICh0aGlzLnBvcyArIGkpKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAoY2hyID09PSAnKicpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy5jdXJyZW50Tm9kZS5lcXVhbHNBdCgnLCcsIC0xKSAmJiAhdGhpcy5jdXJyZW50Tm9kZS5lcXVhbHNBdCgnOicsIC0xKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgcmFuZ2Ugd2lsZGNhcmQgYXQgcG9zaXRpb24gJyArICh0aGlzLnBvcyArIGkpKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAoY2hyID09PSAnLCcpIHtcbiAgICAgICAgICAgIGlmICghdGhpcy5jdXJyZW50Tm9kZS5pc0RpZ2l0KC0xKSAmJiAhdGhpcy5jdXJyZW50Tm9kZS5lcXVhbHNBdCgnKicsIC0xKSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgc2VxdWVuY2Ugc2VwYXJhdG9yICwgYXQgcG9zaXRpb24gJyArICh0aGlzLnBvcyArIGkpKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuY3VycmVudE5vZGUuZXF1YWxzQXQoJyonLCAtMSkgJiYgIXRoaXMuY3VycmVudE5vZGUuZXF1YWxzQXQoJzonLCAtMikpIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmV4cGVjdGVkIHNlcXVlbmNlIHNlcGFyYXRvciAsIGF0IHBvc2l0aW9uICcgKyAodGhpcy5wb3MgKyBpKSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2UgaWYgKCEvXFxkLy50ZXN0KGNocikpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBjaGFyIGF0IHBvc2l0aW9uICcgKyAodGhpcy5wb3MgKyBpKSlcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoL1xcZC8udGVzdChjaHIpICYmIHRoaXMuY3VycmVudE5vZGUuZXF1YWxzQXQoJyonLCAtMSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignVW5leHBlY3RlZCBudW1iZXIgYXQgcG9zaXRpb24gJyArICh0aGlzLnBvcyArIGkpKVxuICAgICAgICAgIH1cblxuICAgICAgICAgIHRoaXMuY3VycmVudE5vZGUudmFsdWVFbmQgPSBpICsgMVxuICAgICAgICAgIGJyZWFrXG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIChidWZmZXJzLCBvcHRpb25zID0ge30pIHtcbiAgbGV0IHBhcnNlciA9IG5ldyBQYXJzZXJJbnN0YW5jZShidWZmZXJzLCBvcHRpb25zKVxuICBsZXQgcmVzcG9uc2UgPSB7fVxuXG4gIHJlc3BvbnNlLnRhZyA9IHBhcnNlci5nZXRUYWcoKVxuICBwYXJzZXIuZ2V0U3BhY2UoKVxuICByZXNwb25zZS5jb21tYW5kID0gcGFyc2VyLmdldENvbW1hbmQoKVxuXG4gIGlmIChbJ1VJRCcsICdBVVRIRU5USUNBVEUnXS5pbmRleE9mKChyZXNwb25zZS5jb21tYW5kIHx8ICcnKS50b1VwcGVyQ2FzZSgpKSA+PSAwKSB7XG4gICAgcGFyc2VyLmdldFNwYWNlKClcbiAgICByZXNwb25zZS5jb21tYW5kICs9ICcgJyArIHBhcnNlci5nZXRFbGVtZW50KENPTU1BTkQoKSlcbiAgfVxuXG4gIGlmICghaXNFbXB0eShwYXJzZXIucmVtYWluZGVyKSkge1xuICAgIHBhcnNlci5nZXRTcGFjZSgpXG4gICAgcmVzcG9uc2UuYXR0cmlidXRlcyA9IHBhcnNlci5nZXRBdHRyaWJ1dGVzKClcbiAgfVxuXG4gIGlmIChwYXJzZXIuaHVtYW5SZWFkYWJsZSkge1xuICAgIHJlc3BvbnNlLmF0dHJpYnV0ZXMgPSAocmVzcG9uc2UuYXR0cmlidXRlcyB8fCBbXSkuY29uY2F0KHtcbiAgICAgIHR5cGU6ICdURVhUJyxcbiAgICAgIHZhbHVlOiBwYXJzZXIuaHVtYW5SZWFkYWJsZVxuICAgIH0pXG4gIH1cblxuICByZXR1cm4gcmVzcG9uc2Vcbn1cbiJdfQ==