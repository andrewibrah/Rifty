import { predictRuntimeIntent } from '../runtime/intent-engine/index';

const cases = [
  {
    text: 'Reflect on why I felt overwhelmed tonight and log it as a journal entry.',
    expected: 'Journal Entry',
  },
  {
    text: 'Set a goal to hire our founding designer with milestones.',
    expected: 'Goal Create',
  },
  {
    text: 'Schedule a deep work block tomorrow at 9am.',
    expected: 'Schedule Create',
  },
  {
    text: 'Remind me at 8pm to close the laptop.',
    expected: 'Reminder Set',
  },
  {
    text: 'Analyze my last five entries for any pattern.',
    expected: 'Reflection Request',
  },
  {
    text: 'Switch my coaching tone back to gentle mode.',
    expected: 'Settings Change',
  },
  {
    text: 'Connect this burnout note to last week\'s travel entry.',
    expected: 'Insight Link',
  },
];

for (const testCase of cases) {
  const result = predictRuntimeIntent(testCase.text);
  console.assert(
    result.primary.label === testCase.expected,
    `Expected ${testCase.expected} but received ${result.primary.label}`
  );
}

console.log('intent-runtime.test.ts ✅');
