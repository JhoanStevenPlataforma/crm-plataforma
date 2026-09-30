import { Dashboard } from "./Dashboard";
import MobileHeader from "../layout/MobileHeader";
import { MobileContent } from "../layout/MobileContent";
import { useConfigurationContext } from "../root/ConfigurationContext";

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  const { darkModeLogo, lightModeLogo, title } = useConfigurationContext();
  return (
    <>
      <MobileHeader>
        {/* The logo is a wordmark and carries the product name, so no title
            text sits beside it. */}
        <div className="flex items-center py-3">
          <img
            className="[.light_&]:hidden h-7 w-auto object-contain"
            src={darkModeLogo}
            alt={title}
          />
          <img
            className="[.dark_&]:hidden h-7 w-auto object-contain"
            src={lightModeLogo}
            alt={title}
          />
        </div>
      </MobileHeader>
      <MobileContent>{children}</MobileContent>
    </>
  );
};

/**
 * The phone gets the same dashboard as the desk — KPIs, pipeline, closing
 * soon, revenue trend, activity, hot contacts and tasks — stacked in one
 * column (every grid in `Dashboard` only splits from `xl` up). Only the frame
 * differs: the mobile header with the logo, and room for the bottom bar.
 */
export const MobileDashboard = () => (
  <Wrapper>
    <Dashboard />
  </Wrapper>
);
