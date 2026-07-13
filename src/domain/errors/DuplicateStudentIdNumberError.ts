export class DuplicateStudentIdNumberError extends Error {
  constructor(public readonly studentIdNumber: string) {
    super(`Student ID number already exists: ${studentIdNumber}`);
    this.name = 'DuplicateStudentIdNumberError';
  }
}
