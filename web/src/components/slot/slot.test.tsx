import { Fragment } from 'hono/jsx';
import { honoRender } from '@/lib/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { Slot } from './slot';

describe('Slot component (Hono SSR)', () => {
  describe('HTML Attributes Merging', () => {
    it('should render the child tag replacing the Slot', () => {
      const node = (
        <Slot id="slot-id" aria-hidden="true">
          <div id="child-id">Content</div>
        </Slot>
      );
      const finalNode = honoRender(node);

      expect(finalNode.tag).toBe('div');
      expect(finalNode.props.id).toBe('child-id');
      expect(finalNode.props['aria-hidden']).toBe('true');
    });

    it('should merge `class` attributes', () => {
      const node = (
        <Slot class="slot-class">
          <div class="child-class" />
        </Slot>
      );
      const finalNode = honoRender(node);

      expect(finalNode.props.class).toBe('slot-class child-class');
    });

    it('should merge `className` attributes', () => {
      const node = (
        <Slot className="slot-class">
          <div className="child-class" />
        </Slot>
      );
      const finalNode = honoRender(node);

      expect(finalNode.props.class).toBe('slot-class child-class');
    });

    it('should merge string styles', () => {
      // Notice the standard HTML string syntax here
      const node = (
        // oxlint-disable-next-line react/style-prop-object -- we need to test string style merging, which is not a standard React pattern
        <Slot style="color: red;">
          {/* eslint-disable-next-line react/style-prop-object */}
          <div style="background: blue;" />
        </Slot>
      );
      const finalNode = honoRender(node);

      expect(finalNode.props.style).toBe('color: red; background: blue;');
    });

    it('should merge object styles', () => {
      const node = (
        <Slot style={{ color: 'red' }}>
          <div style={{ background: 'blue' }} />
        </Slot>
      );
      const finalNode = honoRender(node);

      expect(finalNode.props.style).toEqual({ color: 'red', background: 'blue' });
    });
  });

  describe('Event Handler Merging (Radix equivalents)', () => {
    describe('with onClick on itself', () => {
      it('should call the onClick passed to the Slot', () => {
        const handleClick = vi.fn();
        const node = (
          <Slot onClick={handleClick}>
            <button type="button">Click me</button>
          </Slot>
        );

        const finalNode = honoRender(node);
        finalNode.props.onClick('event');

        expect(handleClick).toHaveBeenCalledTimes(1);
        expect(handleClick).toHaveBeenCalledWith('event');
      });
    });

    describe('with onClick on the child', () => {
      it("should call the child's onClick", () => {
        const handleClick = vi.fn();
        const node = (
          <Slot>
            <button type="button" onClick={handleClick}>
              Click me
            </button>
          </Slot>
        );

        const finalNode = honoRender(node);
        finalNode.props.onClick('event');

        expect(handleClick).toHaveBeenCalledTimes(1);
        expect(handleClick).toHaveBeenCalledWith('event');
      });
    });

    describe('with onClick on itself AND the child', () => {
      it("should call both the Slot's and child's onClick", () => {
        const handleSlotClick = vi.fn();
        const handleChildClick = vi.fn(() => 'child-result');

        const node = (
          <Slot onClick={handleSlotClick}>
            <button type="button" onClick={handleChildClick}>
              Click me
            </button>
          </Slot>
        );

        const finalNode = honoRender(node);
        const result = finalNode.props.onClick('event');

        expect(result).toBe('child-result');
        expect(handleSlotClick).toHaveBeenCalledTimes(1);
        expect(handleChildClick).toHaveBeenCalledTimes(1);
      });
    });

    describe('with onClick on itself AND undefined onClick on the child', () => {
      it("should call the Slot's onClick", () => {
        const handleSlotClick = vi.fn();
        const node = (
          <Slot onClick={handleSlotClick}>
            <button type="button" onClick={undefined}>
              Click me
            </button>
          </Slot>
        );

        const finalNode = honoRender(node);
        finalNode.props.onClick('event');

        expect(handleSlotClick).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Fragment Handling', () => {
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    it('should unwrap Fragment and merge props if it contains exactly one element', () => {
      const node = (
        <Slot class="slot-class">
          <Fragment>
            <div class="child-class">Child</div>
          </Fragment>
        </Slot>
      );

      const finalNode = honoRender(node);
      expect(finalNode.tag).toBe('div');
      expect(finalNode.props.class).toBe('slot-class child-class');
    });

    it('should warn and skip merging if Fragment has multiple elements', () => {
      const node = (
        <Slot class="slot-class">
          <Fragment>
            <div class="child1">Child 1</div>
            <div class="child2">Child 2</div>
          </Fragment>
        </Slot>
      );

      const finalNode = honoRender(node);

      expect(finalNode.props.class).toBeUndefined();
      expect(['', Fragment, undefined]).toContain(finalNode.tag);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Slot component expects exactly one element child. Found multiple or zero elements inside Fragment.',
      );
    });
  });

  describe('Ref Merging (composeRefs)', () => {
    it('should compose both object and function refs', () => {
      const slotRef = Object.assign(vi.fn<(instance: unknown) => void>(), { current: null });
      const childRef = { current: null };

      const node = (
        <Slot ref={slotRef}>
          <button ref={childRef}>Click me</button>
        </Slot>
      );

      const finalNode = honoRender(node);
      finalNode.props.ref('dom-node-instance');

      expect(slotRef).toHaveBeenCalledWith('dom-node-instance');
      expect(childRef.current).toBe('dom-node-instance');
    });

    it('should handle missing refs gracefully', () => {
      const slotRef = Object.assign(vi.fn<(instance: unknown) => void>(), { current: null });

      const node = (
        <Slot ref={slotRef}>
          <button>Click me</button>
        </Slot>
      );

      const finalNode = honoRender(node);
      finalNode.props.ref('dom-node-instance');

      expect(slotRef).toHaveBeenCalledWith('dom-node-instance');
    });
  });
});
