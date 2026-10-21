import FitNumericText from './FitNumericText';
import { formatNumberWithCommas } from '../utils/formatMoneyXaf';

/** Comma-formatted number that auto-shrinks to fit its container. */
export default function FormattedNumber({
  value,
  maximumFractionDigits = 0,
  className,
  as,
  minScale,
  ...rest
}) {
  return (
    <FitNumericText className={className} as={as} minScale={minScale} {...rest}>
      {formatNumberWithCommas(value, { maximumFractionDigits })}
    </FitNumericText>
  );
}
