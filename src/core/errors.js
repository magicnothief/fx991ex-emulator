// Calculator error types, named after the messages the fx-991EX shows.
export const ERR = Object.freeze({
  MATH: 'Math ERROR',
  STACK: 'Stack ERROR',
  SYNTAX: 'Syntax ERROR',
  ARGUMENT: 'Argument ERROR',
  DIMENSION: 'Dimension ERROR',
  VARIABLE: 'Variable ERROR',
  CANT_SOLVE: 'Cannot Solve',
  RANGE: 'Range ERROR',
  TIME_OUT: 'Time Out',
  CIRCULAR: 'Circular ERROR',
  MEMORY: 'Memory ERROR',
});

export class CalcError extends Error {
  constructor(kind, pos = null) {
    super(kind);
    this.kind = kind;
    this.pos = pos; // optional editor position where the error was detected
  }
}

export const fail = (kind, pos) => { throw new CalcError(kind, pos); };
