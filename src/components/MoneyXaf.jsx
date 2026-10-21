import FitNumericText from './FitNumericText';
import { formatMoneyXaf } from '../utils/formatMoneyXaf';

/** XAF amount that auto-shrinks to fit its container. */
export default function MoneyXaf({ value, className, as, minScale, ...rest }) {
  return (
    <FitNumericText className={className} as={as} minScale={minScale} {...rest}>
      {formatMoneyXaf(value)}
    </FitNumericText>
  );
}
