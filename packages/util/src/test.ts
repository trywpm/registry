import { isValidElement } from 'hono/jsx';

export function evaluateVNode(jsxNode: unknown) {
  if (!isValidElement(jsxNode)) {
    throw new Error('Provided value is not a valid JSX element');
  }

  let current = jsxNode;

  while (typeof current.tag === 'function') {
    current = current.tag(current.props, current.props.ref);
  }

  return current;
}
