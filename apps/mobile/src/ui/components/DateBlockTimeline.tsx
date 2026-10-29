import { Pressable, View } from 'react-native';
import { Text } from '../primitives/Text';
import { color, space } from '../theme';

export type DateBlockItem = {
  /** For example `Thu`. */
  day: string;
  /** For example `22`. */
  date: string;
  /** For example `Oct`. */
  month: string;
  title: string;
  reason: string;
  /** Already formatted, for example `₹12,400`. */
  amount: string;
};

export type DateBlockTimelineProps = {
  items: DateBlockItem[];
  onPressItem: (index: number) => void;
};

const BLOCK_WIDTH = 48;

function DateBlock({ item, index }: { item: DateBlockItem; index: number }) {
  return (
    <View
      testID={`date-block-${index}`}
      style={{
        width: BLOCK_WIDTH,
        // minHeight, not height: the date must not clip at 200% font scale.
        minHeight: 58,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: color.surface2,
        borderWidth: 1,
        borderColor: color.hairline,
      }}
    >
      <Text variant="micro" color="muted" numberOfLines={1}>
        {item.day}
      </Text>
      <Text variant="numS" numberOfLines={1} style={{ fontSize: 20, lineHeight: 24 }}>
        {item.date}
      </Text>
      <Text variant="micro" color="muted" numberOfLines={1}>
        {item.month}
      </Text>
    </View>
  );
}

/**
 * Date-block timeline, "Coming up" (design.md 6.7). Each row is one whole-row pressable that
 * leads to Plan; a 1px `rule` connector joins the blocks.
 */
export function DateBlockTimeline({ items, onPressItem }: DateBlockTimelineProps) {
  return (
    <View testID="date-block-timeline">
      {items.map((item, index) => (
        <View key={`row-${index}`}>
          {index > 0 ? (
            <View
              testID="date-block-connector"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                width: 1,
                height: 12,
                marginLeft: BLOCK_WIDTH / 2,
                backgroundColor: color.rule,
              }}
            />
          ) : null}
          <Pressable
            testID={`date-block-row-${index}`}
            accessibilityRole="button"
            accessibilityLabel={`${item.day} ${item.date} ${item.month}, ${item.title}, ${item.reason}, ${item.amount}`}
            onPress={() => onPressItem(index)}
            style={{
              minHeight: space.touch,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.grid,
            }}
          >
            <DateBlock item={item} index={index} />
            <View style={{ flex: 1 }}>
              <Text variant="title">{item.title}</Text>
              <Text variant="caption" color="muted">
                {item.reason}
              </Text>
            </View>
            <Text
              variant="numXS"
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={{ flexShrink: 0 }}
            >
              {item.amount}
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
